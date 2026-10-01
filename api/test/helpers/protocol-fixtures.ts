import { createServer, type Socket } from "node:net";
import { createSecureContext, TLSSocket } from "node:tls";

// Minimal wire fixtures exercise the installed drivers' deadlines. They are
// not database/Valkey emulators and do not replace service-backed integration.
export async function postgresQueryFixture(tls?: { key: Buffer; cert: Buffer }) {
  const sockets = new Set<Socket>();
  const state = { stall: true, executions: 0, connections: 0, closedConnections: 0, sql: [] as string[] };
  const message = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4); length.writeInt32BE(body.length + 4);
    return Buffer.concat([Buffer.from(type), length, body]);
  };
  const ready = () => message("Z", Buffer.from("I"));
  const parameter = (name: string, value: string) => message("S", Buffer.from(`${name}\0${value}\0`));
  const server = createServer(rawSocket => {
    let socket: Socket = rawSocket;
    sockets.add(socket); state.connections += 1;
    let buffer = Buffer.alloc(0); let started = false; let executing = false; let described = false; let binary = false; let preparedSql = "";
    const describe = () => {
      const fields = Buffer.alloc(2); fields.writeInt16BE(1);
      const column = Buffer.alloc(18); column.writeInt32BE(23, 6); column.writeInt16BE(4, 10);
      column.writeInt32BE(-1, 12); column.writeInt16BE(binary ? 1 : 0, 16);
      return message("T", Buffer.concat([fields, Buffer.from("one\0"), column]));
    };
    const execute = (sql: string, simple = false) => {
      state.sql.push(sql);
      if (!/SELECT/i.test(sql)) { socket.write(Buffer.concat([message("C", Buffer.from("SET\0")), ...(simple ? [ready()] : [])])); return; }
      state.executions += 1; executing = state.stall;
      if (!executing) {
        const value = binary ? Buffer.from([0, 0, 0, 1]) : Buffer.from("1");
        const row = Buffer.alloc(6); row.writeInt16BE(1); row.writeInt32BE(value.length, 2);
        socket.write(Buffer.concat([...(!described ? [describe()] : []), message("D", Buffer.concat([row, value])), message("C", Buffer.from("SELECT 1\0")), ...(simple ? [ready()] : [])]));
      }
    };
    socket.on("error", () => undefined);
    socket.on("close", () => { sockets.delete(socket); state.closedConnections += 1; });
    const consume = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        if (!started) {
          if (buffer.length < 4) return;
          const length = buffer.readInt32BE(0);
          if (buffer.length < length) return;
          const body = buffer.subarray(4, length); buffer = buffer.subarray(length);
          if (length === 8 && body.readInt32BE(0) === 80877103) {
            if (!tls) { socket.write("N"); continue; }
            socket.removeListener("data", consume);
            socket.write("S", () => {
              socket = new TLSSocket(rawSocket, { isServer: true, secureContext: createSecureContext(tls) });
              socket.on("error", () => undefined); socket.on("data", consume);
            });
            return;
          }
          if (length === 16 && body.readInt32BE(0) === 80877102) { socket.end(); return; }
          started = true;
          socket.write(Buffer.concat([message("R", Buffer.alloc(4)), parameter("server_version", "16.0"),
            parameter("client_encoding", "UTF8"), parameter("standard_conforming_strings", "on"), ready()]));
          continue;
        }
        if (buffer.length < 5) return;
        const length = buffer.readInt32BE(1);
        if (buffer.length < length + 1) return;
        const type = String.fromCharCode(buffer[0]); const body = buffer.subarray(5, length + 1);
        buffer = buffer.subarray(length + 1);
        if (type === "P") { described = false; preparedSql = body.toString().split("\0")[1]; socket.write(message("1", Buffer.alloc(0))); }
        else if (type === "B") { binary = body.readInt16BE(body.length - 2) === 1; socket.write(message("2", Buffer.alloc(0))); }
        else if (type === "D") {
          described = true;
          socket.write(Buffer.concat([...(body[0] === 83 ? [message("t", Buffer.alloc(2))] : []), describe()]));
        } else if (type === "E") execute(preparedSql);
        else if (type === "S" && !executing) socket.write(ready());
        else if (type === "Q") { described = false; binary = false; execute(body.toString(), true); }
        else if (type === "X") socket.end();
      }
    };
    socket.on("data", consume);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return {
    state, url: `postgresql://fixture:fixture@127.0.0.1:${address.port}/fixture?connection_limit=1&connect_timeout=2&pool_timeout=2&socket_timeout=3`,
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
  };
}

export async function pubSubFixture() {
  const sockets = new Set<Socket>();
  const subscriptions = new Map<string, Set<Socket>>();
  const state = { suppressDelivery: false, suppressPublishReply: false, publishes: 0 };
  const bulk = (value: string) => `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  const array = (items: string[]) => `*${items.length}\r\n${items.join("")}`;
  const server = createServer(socket => {
    sockets.add(socket); let buffer = Buffer.alloc(0);
    socket.on("error", () => undefined);
    socket.on("close", () => { sockets.delete(socket); for (const subscribers of subscriptions.values()) subscribers.delete(socket); });
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        const end = buffer.indexOf("\r\n"); if (end < 0) return;
        const count = Number(buffer.subarray(1, end)); let offset = end + 2; const parts: string[] = [];
        for (let index = 0; index < count; index += 1) {
          const line = buffer.indexOf("\r\n", offset); if (line < 0) return;
          const length = Number(buffer.subarray(offset + 1, line)); offset = line + 2;
          if (buffer.length < offset + length + 2) return;
          parts.push(buffer.subarray(offset, offset + length).toString()); offset += length + 2;
        }
        buffer = buffer.subarray(offset); const command = parts[0].toUpperCase();
        if (command === "SUBSCRIBE") {
          const subscribers = subscriptions.get(parts[1]) ?? new Set<Socket>(); subscribers.add(socket); subscriptions.set(parts[1], subscribers);
          socket.write(array([bulk("subscribe"), bulk(parts[1]), ":1\r\n"]));
        } else if (command === "PUBLISH") {
          state.publishes += 1; const subscribers = subscriptions.get(parts[1]) ?? [];
          if (!state.suppressDelivery) for (const subscriber of subscribers) subscriber.write(array([bulk("message"), bulk(parts[1]), bulk(parts[2])]));
          if (!state.suppressPublishReply) socket.write(":1\r\n");
        } else if (command === "PING") socket.write("+PONG\r\n");
        else if (command === "EVAL") socket.write(":1\r\n");
        else if (command === "QUIT") socket.end("+OK\r\n");
        else socket.write("+OK\r\n");
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return {
    state, url: `redis://127.0.0.1:${address.port}`,
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
  };
}
