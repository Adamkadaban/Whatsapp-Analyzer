import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ColorModal from "./ColorModal";
import { createMockPersonBuckets } from "../../lib/__fixtures__/mockSummary";

const buckets = [
  createMockPersonBuckets("Alice", 100),
  createMockPersonBuckets("Bob", 80),
];

function renderModal(onClose = vi.fn()) {
  const getColor = (name: string) => (name === "Alice" ? "#ff0000" : "#00ff00");
  render(
    <ColorModal
      bucketsByPerson={buckets}
      onColorChange={vi.fn()}
      onClose={onClose}
      getColor={getColor}
    />
  );
  return { onClose };
}

describe("ColorModal accessibility", () => {
  it("exposes a labelled dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "color-modal-title");
    expect(screen.getByText("Configure user colors")).toHaveAttribute(
      "id",
      "color-modal-title"
    );
  });

  it("focuses the close button on open", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /Close color configuration/i })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on card click", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Clicking the dialog title (inside the card) must not close.
    await user.click(screen.getByText("Configure user colors"));
    expect(onClose).not.toHaveBeenCalled();

    // Clicking the backdrop (the dialog element itself) closes.
    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus within the dialog", () => {
    renderModal();
    const closeBtn = screen.getByRole("button", { name: /Close color configuration/i });
    expect(closeBtn).toHaveFocus(); // first focusable element focused on open

    // Shift+Tab from the first element wraps to the last focusable element.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    const inputs = screen.getAllByLabelText(/Choose color for/i);
    const last = inputs[inputs.length - 1];
    expect(last).toHaveFocus();

    // Tab from the last element wraps back to the first (close button).
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeBtn).toHaveFocus();
  });

  it("restores focus to the previously focused element on close", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Configure colors";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const onClose = vi.fn();
    const { unmount } = render(
      <ColorModal
        bucketsByPerson={buckets}
        onColorChange={vi.fn()}
        onClose={onClose}
        getColor={() => "#ff0000"}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Close color configuration/i })
      ).toHaveFocus()
    );

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
