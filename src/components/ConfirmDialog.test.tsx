import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import ConfirmDialog from "./ConfirmDialog";
import {
  setConfirmDialogOpen,
  setConfirmDialogConfig,
  confirmDialogOpen,
} from "../stores/appStore";

describe("ConfirmDialog", () => {
  it("closes when the dark backdrop is clicked", () => {
    render(() => {
      setConfirmDialogConfig({
        title: "Overwrite?",
        message: "Are you sure?",
        confirmText: "Overwrite",
        onConfirm: () => {},
      });
      setConfirmDialogOpen(true);
      return <ConfirmDialog />;
    });

    const backdrop = screen
      .getByText("Overwrite?")
      .closest("div.fixed")
      ?.querySelector("div.absolute.inset-0");
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);

    expect(confirmDialogOpen()).toBe(false);
  });

  it("does not close when clicking inside the dialog content", () => {
    render(() => {
      setConfirmDialogConfig({
        title: "Overwrite?",
        message: "Are you sure?",
        confirmText: "Overwrite",
        onConfirm: () => {},
      });
      setConfirmDialogOpen(true);
      return <ConfirmDialog />;
    });

    const message = screen.getByText("Are you sure?");
    fireEvent.click(message);

    expect(confirmDialogOpen()).toBe(true);
  });

  it("closes when the Cancel button is clicked", () => {
    render(() => {
      setConfirmDialogConfig({
        title: "Overwrite?",
        message: "Are you sure?",
        confirmText: "Overwrite",
        onConfirm: () => {},
      });
      setConfirmDialogOpen(true);
      return <ConfirmDialog />;
    });

    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);

    expect(confirmDialogOpen()).toBe(false);
  });

  it("uses cancelText when provided", () => {
    render(() => {
      setConfirmDialogConfig({
        title: "Trim in progress",
        message: "Cancel the trim and quit?",
        confirmText: "Quit",
        cancelText: "Stay",
        confirmVariant: "danger",
        onConfirm: () => {},
      });
      setConfirmDialogOpen(true);
      return <ConfirmDialog />;
    });
    expect(screen.getByRole("button", { name: "Stay" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
