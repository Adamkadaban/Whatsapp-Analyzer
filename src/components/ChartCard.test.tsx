import { render, screen } from "@testing-library/react";
import ChartCard from "./ChartCard";

describe("ChartCard", () => {
  it("renders title, action, and children", () => {
    render(
      <ChartCard title="Chart title" action={<button>Action</button>}>
        <div>Child content</div>
      </ChartCard>
    );

    expect(screen.getByText("Chart title")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });
});
