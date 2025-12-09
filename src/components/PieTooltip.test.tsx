import { render, screen } from "@testing-library/react";
import type { TooltipProps } from "recharts";
import PieTooltip from "./PieTooltip";

type Payload = TooltipProps<number, string>["payload"];

describe("PieTooltip", () => {
  const payload = [
    {
      name: "Alice",
      value: 120,
      percent: 0.6,
      payload: { name: "Alice", value: 120 },
    },
  ] as unknown as Payload;

  it("renders name and message count with white text", () => {
    render(<PieTooltip active payload={payload} />);

    const name = screen.getByText("Alice");
    const messages = screen.getByText(/messages/);

    expect(name).toBeInTheDocument();
    expect(messages).toHaveTextContent("120 messages · 60%");
    expect(name).toHaveStyle({ color: "#fff" });
    expect(messages).toHaveStyle({ color: "rgba(255,255,255,0.75)" });
  });

  it("returns null when inactive", () => {
    const { container } = render(<PieTooltip active={false} payload={payload} />);
    expect(container.firstChild).toBeNull();
  });
});
