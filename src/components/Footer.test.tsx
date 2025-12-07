import { render, screen } from "@testing-library/react";
import Footer from "./Footer";

describe("Footer", () => {
  it("shows badges and repo link", () => {
    render(<Footer />);

    expect(screen.getByText(/Not affiliated with WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByText("Client-only")).toBeInTheDocument();
    expect(screen.getByText("Open source")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /View code/i });
    expect(link).toHaveAttribute("href", "https://github.com/Adamkadaban/Whatsapp-Analyzer");
  });
});
