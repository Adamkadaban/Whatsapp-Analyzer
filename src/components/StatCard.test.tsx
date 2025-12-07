import { render, screen } from "@testing-library/react";
import StatCard from "./StatCard";

describe("StatCard", () => {
  it("renders label, value, and detail", () => {
    render(<StatCard label="Messages" value="123" detail="Last 7 days" />);

    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
  });
});
