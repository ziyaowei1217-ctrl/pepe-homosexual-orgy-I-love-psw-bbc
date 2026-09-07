import type { ReactElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  type RenderResult
} from "@testing-library/react";
import { afterEach } from "vitest";

type TestProps = Record<string, unknown> & {
  onChange: (event: { target: Record<string, unknown> }) => void;
  onClick: () => Promise<void>;
  onSubmit: (event?: unknown) => Promise<void>;
  style: CSSStyleDeclaration;
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: window.localStorage
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: window.sessionStorage
});

if (!("createObjectURL" in URL)) {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:test-object"
  });
}
if (!("revokeObjectURL" in URL)) {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined
  });
}

if (!("ResizeObserver" in globalThis)) {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class TestResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  });
}

if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false
    })
  });
}

if (!("scrollIntoView" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined
  });
}

afterEach(cleanup);

export class ReactTestInstance {
  constructor(readonly element: Element) {}

  get type() {
    return this.element.tagName.toLowerCase();
  }

  get props(): TestProps {
    const element = this.element;
    return new Proxy({} as TestProps, {
      get(_target, property) {
        if (typeof property !== "string") return undefined;
        if (property === "onClick") {
          return async () => {
            fireEvent.click(element);
          };
        }
        if (property === "onSubmit") {
          return async () => {
            fireEvent.submit(element);
          };
        }
        if (property === "onChange") {
          return (event: { target: Record<string, unknown> }) => {
            fireEvent.change(element, { target: event.target });
          };
        }
        return readElementProp(element, property);
      }
    });
  }

  get parent(): ReactTestInstance | null {
    return this.element.parentElement
      ? new ReactTestInstance(this.element.parentElement)
      : null;
  }

  get children(): Array<string | ReactTestInstance> {
    const children: Array<string | ReactTestInstance> = [];
    for (const child of Array.from(this.element.childNodes)) {
      if (child.nodeType === child.TEXT_NODE) {
        children.push(child.textContent ?? "");
      } else if (child instanceof Element) {
        children.push(new ReactTestInstance(child));
      }
    }
    return children;
  }

  findAll(predicate: (node: ReactTestInstance) => boolean) {
    return this.descendants().filter(predicate);
  }

  find(predicate: (node: ReactTestInstance) => boolean) {
    return requireSingle(this.findAll(predicate), "predicate");
  }

  findAllByProps(expected: Record<string, unknown>) {
    return this.descendants().filter((node) =>
      Object.entries(expected).every(
        ([property, value]) => node.props[property] === value
      )
    );
  }

  findByProps(expected: Record<string, unknown>) {
    return requireSingle(this.findAllByProps(expected), "props");
  }

  findAllByType(type: string) {
    return Array.from(this.element.querySelectorAll(type)).map(
      (element) => new ReactTestInstance(element)
    );
  }

  findByType(type: string) {
    return requireSingle(this.findAllByType(type), `type ${type}`);
  }

  private descendants() {
    return Array.from(this.element.querySelectorAll("*")).map(
      (element) => new ReactTestInstance(element)
    );
  }
}

export class ReactTestRenderer {
  constructor(private readonly rendered: RenderResult) {}

  get root() {
    return new ReactTestInstance(this.rendered.container);
  }

  update(element: ReactElement) {
    this.rendered.rerender(element);
  }

  unmount() {
    this.rendered.unmount();
  }
}

export function create(element: ReactElement) {
  return new ReactTestRenderer(render(element));
}

function readElementProp(element: Element, property: string) {
  if (property === "className") return element.getAttribute("class") ?? undefined;
  if (property === "style") return (element as HTMLElement).style;
  if (property in element) {
    const value = (element as unknown as Record<string, unknown>)[property];
    if (typeof value !== "function") return value;
  }
  return element.getAttribute(property) ?? undefined;
}

function requireSingle(nodes: ReactTestInstance[], description: string) {
  if (nodes.length !== 1) {
    throw new Error(`Expected one element matching ${description}, found ${nodes.length}`);
  }
  return nodes[0];
}

export { act };

class TestRenderer {
  static act = act;
  static create = create;
}

namespace TestRenderer {
  export type ReactTestInstance = import("./dom-test-renderer").ReactTestInstance;
  export type ReactTestRenderer = import("./dom-test-renderer").ReactTestRenderer;
}

export default TestRenderer;
