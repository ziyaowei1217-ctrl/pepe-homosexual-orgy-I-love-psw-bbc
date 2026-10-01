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
