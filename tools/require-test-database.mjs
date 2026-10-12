import { requireTestDatabase } from "./infrastructure-env.mjs";
try { requireTestDatabase(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
