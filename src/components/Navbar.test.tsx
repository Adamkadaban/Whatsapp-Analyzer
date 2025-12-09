import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

describe("Navbar", () => {
  it("renders links and highlights active route", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.getByAltText(/WA Analyzer/i)).toBeInTheDocument();

    const home = screen.getByText("Home");
    const insights = screen.getByText("Insights");

    expect(home).toHaveAttribute("href", "/");
    expect(insights).toHaveAttribute("href", "/dashboard");
    expect(insights).toHaveStyle({ background: "rgba(255,255,255,0.08)" });
  });
});
