// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListingDetailExperience } from "../components/marketplace/listing-detail-experience";
import { ApplicationFormExperience } from "../components/marketplace/application-experiences";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { createPreviewListings } from "../lib/preview-data";

const listing = { ...createPreviewListings()[0], availableFrom: "2026-09-01", availableTo: "2027-06-01", images: ["https://images.example/one.jpg", "https://images.example/two.jpg", "https://images.example/three.jpg"] };
const stay = { moveIn: "2026-10-01", moveOut: "2026-12-01" };
beforeEach(() => { window.history.replaceState(null, "", "/"); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T18:00:00Z")); });
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.useRealTimers(); });

describe("listing to application journey", () => {
  it("takes the selected dates into the application and blocks an unavailable selection", () => {
    render(<SavedListingsProvider><ListingDetailExperience listing={listing} initialStay={stay} /></SavedListingsProvider>);
    expect(screen.getByLabelText("入住日期").getAttribute("value")).toBe(stay.moveIn);
    expect(screen.getAllByRole("link", { name: "申请租住" })[0].getAttribute("href")).toContain("moveOut=2026-12-01");
    fireEvent.change(screen.getByLabelText("退租日期"), { target: { value: "2027-07-01" } });
    expect(screen.queryByRole("link", { name: "申请租住" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("可租日期");
    fireEvent.change(screen.getByLabelText("退租日期"), { target: { value: "2027-01-01" } });
    expect(screen.getAllByRole("link", { name: "申请租住" })[0].getAttribute("href")).toContain("moveOut=2027-01-01");
  });

  it("lets mobile renters edit dates in a sheet and discard unfinished changes", () => {
    render(<SavedListingsProvider><ListingDetailExperience listing={listing} initialStay={stay} /></SavedListingsProvider>);
    const trigger = screen.getByRole("button", { name: "编辑租期" });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "选择租期" });
    fireEvent.change(within(dialog).getByLabelText("退租日期"), { target: { value: "2027-01-01" } });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByLabelText("退租日期").getAttribute("value")).toBe(stay.moveOut);
    fireEvent.click(trigger);
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("退租日期"), { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "确认租期" }));
    expect(screen.getAllByRole("link", { name: "申请租住" })[0].getAttribute("href")).toContain("moveOut=2027-02-01");
  });

  it("opens the clicked photo, navigates with arrows and traps then restores focus", () => {
    render(<SavedListingsProvider><ListingDetailExperience listing={listing} /></SavedListingsProvider>);
    const trigger = screen.getByRole("button", { name: "查看图片 2" });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "全部图片" });
    expect(within(dialog).getByRole("status").textContent).toContain("2 / 3");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByRole("status").textContent).toContain("3 / 3");
    const close = within(dialog).getByRole("button", { name: "关闭全部图片" });
    close.focus(); fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("prefills requested dates without losing a personal draft or later edits on reload", () => {
    const first = render(<ApplicationFormExperience listing={listing} initialStay={stay} />);
    fireEvent.change(screen.getByPlaceholderText("你的姓名"), { target: { value: "Lin" } });
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "lin@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("UCLA / Product Intern"), { target: { value: "UCLA" } });
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect((screen.getByLabelText("入住日期") as HTMLInputElement).value).toBe(stay.moveIn);
    fireEvent.change(screen.getByLabelText("入住日期"), { target: { value: "2026-11-01" } });
    first.unmount();
    const restored = render(<ApplicationFormExperience listing={listing} initialStay={stay} />);
    expect((screen.getByLabelText("入住日期") as HTMLInputElement).value).toBe("2026-11-01");
    restored.unmount();
    render(<ApplicationFormExperience listing={listing} initialStay={{ moveIn: "2027-01-01", moveOut: "2027-03-01" }} />);
    expect((screen.getByLabelText("入住日期") as HTMLInputElement).value).toBe("2027-01-01");
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect((screen.getByPlaceholderText("你的姓名") as HTMLInputElement).value).toBe("Lin");
  });

  it("honors an explicit new selection even when it matches the originally requested dates", () => {
    const first = render(<ApplicationFormExperience listing={listing} initialStay={stay} selectionId="first-entry" />);
    fireEvent.change(screen.getByPlaceholderText("你的姓名"), { target: { value: "Lin" } });
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "lin@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("UCLA / Product Intern"), { target: { value: "UCLA" } });
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    fireEvent.change(screen.getByLabelText("入住日期"), { target: { value: "2026-11-01" } });
    first.unmount();
    render(<ApplicationFormExperience listing={listing} initialStay={stay} selectionId="second-entry" />);
    expect((screen.getByLabelText("入住日期") as HTMLInputElement).value).toBe("2026-10-01");
  });

  it("synchronizes the selected stay when browser Back restores an earlier detail URL", () => {
    render(<SavedListingsProvider><ListingDetailExperience listing={listing} initialStay={stay} /></SavedListingsProvider>);
    fireEvent.change(screen.getByLabelText("入住日期"), { target: { value: "2026-11-01" } });
    window.history.replaceState(null, "", `/listing/${listing.id}?moveIn=2026-10-01&moveOut=2026-12-01`);
    fireEvent.popState(window);
    expect((screen.getByLabelText("入住日期") as HTMLInputElement).value).toBe("2026-10-01");
  });
});
