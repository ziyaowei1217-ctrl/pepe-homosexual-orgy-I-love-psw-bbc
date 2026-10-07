// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useModalFocus } from "../components/marketplace/use-modal-focus";

afterEach(() => { cleanup(); document.body.style.overflow = ""; });

function Dialog({ empty = false }: { empty?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, vi.fn());
  return <div ref={ref} role="dialog" aria-label="Test dialog">{!empty ? <>
    <input type="hidden" />
    <button disabled>Disabled</button>
    <button tabIndex={-1}>Excluded</button>
    <a href="/hidden" hidden>Hidden</a>
    <select aria-label="First field"><option>One</option></select>
    <textarea aria-label="Last field" />
  </> : null}</div>;
}

it("contains focus including select and textarea controls and ignores hidden or disabled elements", () => {
  render(<><button>Background</button><Dialog /></>);
  const first = screen.getByRole("combobox");
  const last = screen.getByRole("textbox");
  expect(document.activeElement).toBe(first);
  first.focus();
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: "Tab" });
  expect(document.activeElement).toBe(first);
  screen.getByRole("button", { name: "Background" }).focus();
  expect(document.activeElement).toBe(first);
});

it("keeps focus inside a temporarily empty dialog", () => {
  render(<><button>Background</button><Dialog empty /></>);
  const dialog = screen.getByRole("dialog");
  expect(document.activeElement).toBe(dialog);
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(document.activeElement).toBe(dialog);
  screen.getByRole("button", { name: "Background" }).focus();
  expect(document.activeElement).toBe(dialog);
});

function ButtonDialog() {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, vi.fn());
  return <div ref={ref} role="dialog" aria-label="Photo viewer">
    <button>Close viewer</button>
    <button>First thumbnail</button>
    <button>Second thumbnail</button>
  </div>;
}

it("steps between photo viewer buttons without relying on browser tab preferences", () => {
  render(<ButtonDialog />);
  const close = screen.getByRole("button", { name: "Close viewer" });
  const first = screen.getByRole("button", { name: "First thumbnail" });
  const second = screen.getByRole("button", { name: "Second thumbnail" });
  expect(document.activeElement).toBe(close);
  expect(fireEvent.keyDown(close, { key: "Tab" })).toBe(false);
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Tab" });
  expect(document.activeElement).toBe(second);
  fireEvent.keyDown(second, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(close);
});

function VisibilityDialog() {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, vi.fn());
  return <div ref={ref} role="dialog" aria-label="Visible actions">
    <button>First action</button>
    <button style={{ display: "none" }}>Hidden by display</button>
    <div style={{ display: "none" }}><button>Hidden by ancestor</button></div>
    <button style={{ visibility: "hidden" }}>Hidden by visibility</button>
    <div inert><button>Inert action</button></div>
    <fieldset disabled><button>Disabled by fieldset</button></fieldset>
    <button>Last action</button>
  </div>;
}

it("skips unavailable actions when stepping both directions through a dialog", () => {
  render(<VisibilityDialog />);
  const first = screen.getByRole("button", { name: "First action" });
  const last = screen.getByRole("button", { name: "Last action" });
  fireEvent.keyDown(first, { key: "Tab" });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(first);
});

it("leaves editing keys and browser shortcuts to their native handlers", () => {
  render(<Dialog />);
  const first = screen.getByRole("combobox");
  expect(document.activeElement).toBe(first);
  expect(fireEvent.keyDown(first, { key: "ArrowDown" })).toBe(true);
  expect(fireEvent.keyDown(first, { key: "a" })).toBe(true);
  expect(document.activeElement).toBe(first);
  const last = screen.getByRole("textbox");
  last.focus();
  expect(fireEvent.keyDown(last, { key: "Tab", ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(last, { key: "Tab", metaKey: true })).toBe(true);
  expect(document.activeElement).toBe(last);
});

function PriorityDialog() {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, vi.fn());
  return <div ref={ref} role="dialog" aria-label="Ordered actions">
    <button tabIndex={2}>Second action</button>
    <button tabIndex={1}>First action</button>
    <button>Last action</button>
  </div>;
}

it("preserves explicit tab priority followed by the remaining document order", () => {
  render(<PriorityDialog />);
  const first = screen.getByRole("button", { name: "First action" });
  const second = screen.getByRole("button", { name: "Second action" });
  const last = screen.getByRole("button", { name: "Last action" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Tab" });
  expect(document.activeElement).toBe(second);
  fireEvent.keyDown(second, { key: "Tab" });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: "Tab" });
  expect(document.activeElement).toBe(first);
});
