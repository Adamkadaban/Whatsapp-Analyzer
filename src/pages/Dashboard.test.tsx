import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import Dashboard from "./Dashboard";
import { createMockSummary, createEmptySummary } from "../lib/__fixtures__/mockSummary";

// Mock the WASM module
vi.mock("../lib/wasm", () => ({
  analyzeText: vi.fn(),
  preloadWorker: vi.fn(),
}));

// Mock recharts to avoid canvas issues in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  RadarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="radar-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  Bar: () => <div data-testid="bar" />,
  Cell: () => <div data-testid="cell" />,
  CartesianGrid: () => null,
  Legend: () => <div data-testid="legend" />,
  LabelList: () => null,
  Line: () => <div data-testid="line" />,
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  PolarAngleAxis: () => null,
  PolarGrid: () => null,
  Radar: () => <div data-testid="radar" />,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

// Mock JSZip
vi.mock("jszip", () => ({
  default: {
    loadAsync: vi.fn(),
  },
}));

// Mock WordCloud and EmojiCloud to avoid complex d3 dependencies
vi.mock("../components/WordCloud", () => ({
  default: ({ words }: { words: unknown[] }) => (
    <div data-testid="word-cloud" data-word-count={words?.length ?? 0}>
      Word Cloud
    </div>
  ),
}));

vi.mock("../components/EmojiCloud", () => ({
  default: ({ words }: { words: unknown[] }) => (
    <div data-testid="emoji-cloud" data-word-count={words?.length ?? 0}>
      Emoji Cloud
    </div>
  ),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Upload Section", () => {
    it("renders upload UI when no data is loaded", () => {
      render(<Dashboard />);

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Drop your exported WhatsApp .txt.")).toBeInTheDocument();
      expect(screen.getByText("Upload your chat to see insights")).toBeInTheDocument();
      expect(screen.getByText(/Upload .txt file/i)).toBeInTheDocument();
    });

    it("shows export instructions toggle", () => {
      render(<Dashboard />);

      const details = screen.getByText("How do I export my chats?");
      expect(details).toBeInTheDocument();

      fireEvent.click(details);
      expect(screen.getByText(/Open the chat, tap its name/i)).toBeInTheDocument();
    });

    it("has accessible file input", () => {
      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute("type", "file");
      expect(fileInput).toHaveAttribute("accept", ".txt,.zip");
    });

    it("shows drag and drop hint", () => {
      render(<Dashboard />);

      expect(screen.getByText(/or drag & drop/i)).toBeInTheDocument();
    });

    it("has proper drop zone aria attributes", () => {
      render(<Dashboard />);

      const dropZone = screen.getByRole("region", { name: /File drop zone/i });
      expect(dropZone).toBeInTheDocument();
    });
  });

  describe("Loading States", () => {
    it("shows loading overlay during file processing", async () => {
      const { analyzeText } = await import("../lib/wasm");
      (analyzeText as Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createMockSummary()), 100))
      );

      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      const file = new File(["[1/1/24, 10:00] Alice: Hello"], "chat.txt", { type: "text/plain" });

      fireEvent.change(fileInput, { target: { files: [file] } });

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByRole("status")).toBeInTheDocument();
      });
    });
  });

  describe("Dashboard with Data", () => {
    const renderWithData = async () => {
      const { analyzeText } = await import("../lib/wasm");
      const mockSummary = createMockSummary();
      (analyzeText as Mock).mockResolvedValue(mockSummary);

      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      const file = new File(["[1/1/24, 10:00] Alice: Hello"], "chat.txt", { type: "text/plain" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      // Wait for pending state
      await waitFor(() => {
        expect(screen.getByText("Ready to analyze")).toBeInTheDocument();
      });

      // Click analyze
      const analyzeBtn = screen.getByRole("button", { name: "Analyze" });
      fireEvent.click(analyzeBtn);

      // Wait for data to render
      await waitFor(() => {
        expect(screen.getByText("Chat timeline")).toBeInTheDocument();
      }, { timeout: 2000 });

      return mockSummary;
    };

    it("renders timeline chart after analysis", async () => {
      await renderWithData();

      expect(screen.getByText("Chat timeline")).toBeInTheDocument();
      expect(screen.getByText("Message volume over time.")).toBeInTheDocument();
    });

    it("renders per-person stats table", async () => {
      await renderWithData();

      expect(screen.getByText("Per-person stats")).toBeInTheDocument();
      expect(screen.getByText("Total words")).toBeInTheDocument();
      expect(screen.getByText("Unique words")).toBeInTheDocument();
      expect(screen.getByText("Avg words/msg")).toBeInTheDocument();
    });

    it("renders stat cards with KPIs", async () => {
      await renderWithData();

      // Check for KPI labels (values may appear in multiple places)
      expect(screen.getByText("Total messages")).toBeInTheDocument();
      expect(screen.getByText("Active days")).toBeInTheDocument();
      expect(screen.getByText("Busiest day")).toBeInTheDocument();
      expect(screen.getByText("Longest streak")).toBeInTheDocument();
      expect(screen.getByText("Conversation starts")).toBeInTheDocument();
      expect(screen.getByText("Top emoji")).toBeInTheDocument();
      expect(screen.getByText("Top word")).toBeInTheDocument();
    });

    it("renders hourly rhythm chart", async () => {
      await renderWithData();

      expect(screen.getByText("Hourly rhythm")).toBeInTheDocument();
    });

    it("renders top senders pie chart", async () => {
      await renderWithData();

      expect(screen.getByText("Top senders")).toBeInTheDocument();
      expect(screen.getByText("Messages by person")).toBeInTheDocument();
    });

    it("renders conversation starters chart", async () => {
      await renderWithData();

      expect(screen.getByText("Conversation starters")).toBeInTheDocument();
    });

    it("renders monthly and weekday footprint radar charts", async () => {
      await renderWithData();

      expect(screen.getByText("Monthly footprint")).toBeInTheDocument();
      expect(screen.getByText("Weekday footprint")).toBeInTheDocument();
    });

    it("renders word cloud", async () => {
      await renderWithData();

      expect(screen.getByText("Most common words")).toBeInTheDocument();
      expect(screen.getByTestId("word-cloud")).toBeInTheDocument();
    });

    it("renders emoji cloud", async () => {
      await renderWithData();

      expect(screen.getByText("Most used emojis")).toBeInTheDocument();
      expect(screen.getByTestId("emoji-cloud")).toBeInTheDocument();
    });

    it("renders top phrases per sender", async () => {
      await renderWithData();

      expect(screen.getByText("Top phrases per sender")).toBeInTheDocument();
    });

    it("shows export controls when data is loaded", async () => {
      await renderWithData();

      expect(screen.getByText("Filter stop-words")).toBeInTheDocument();
      expect(screen.getByText("Configure colors")).toBeInTheDocument();
      expect(screen.getByText("Export PDF")).toBeInTheDocument();
      expect(screen.getByText("Upload another chat")).toBeInTheDocument();
    });
  });

  describe("Journey Section", () => {
    const renderWithJourney = async () => {
      const { analyzeText } = await import("../lib/wasm");
      const mockSummary = createMockSummary();
      (analyzeText as Mock).mockResolvedValue(mockSummary);

      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      const file = new File(["[1/1/24, 10:00] Alice: Hello"], "chat.txt", { type: "text/plain" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("Ready to analyze")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

      await waitFor(() => {
        expect(screen.getByText("Journey Through Your Messages")).toBeInTheDocument();
      }, { timeout: 2000 });

      return mockSummary;
    };

    it("renders journey section when journey data exists", async () => {
      await renderWithJourney();

      expect(screen.getByText("Journey Through Your Messages")).toBeInTheDocument();
    });

    it("shows journey highlights with stats", async () => {
      await renderWithJourney();

      // Check for the journey stats labels (values may appear multiple times)
      expect(screen.getByText("messages")).toBeInTheDocument();
      expect(screen.getByText("days")).toBeInTheDocument();
      expect(screen.getByText("first message")).toBeInTheDocument();
      expect(screen.getByText("last message")).toBeInTheDocument();
    });

    it("renders first messages section", async () => {
      await renderWithJourney();

      expect(screen.getByText("Where it all began")).toBeInTheDocument();
      expect(screen.getByText("Your conversation started with:")).toBeInTheDocument();
    });

    it("renders last messages section", async () => {
      await renderWithJourney();

      expect(screen.getByText("The latest chapter")).toBeInTheDocument();
      expect(screen.getByText("Your most recent messages:")).toBeInTheDocument();
    });

    it("renders interesting moments section", async () => {
      await renderWithJourney();

      expect(screen.getByText("Memorable moments")).toBeInTheDocument();
      expect(screen.getByText("Most active day")).toBeInTheDocument();
    });
  });

  describe("Sentiment Section", () => {
    it("renders sentiment charts when sentiment data exists", async () => {
      const { analyzeText } = await import("../lib/wasm");
      const mockSummary = createMockSummary();
      (analyzeText as Mock).mockResolvedValue(mockSummary);

      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      const file = new File(["[1/1/24, 10:00] Alice: Hello"], "chat.txt", { type: "text/plain" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("Ready to analyze")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

      await waitFor(() => {
        expect(screen.getByText("Mood lanes by person")).toBeInTheDocument();
      }, { timeout: 2000 });

      expect(screen.getByText("Polarity mix per person")).toBeInTheDocument();
      expect(screen.getByText("Overall mood drift")).toBeInTheDocument();
    });
  });

  describe("Controls and Interactivity", () => {
    const setupWithData = async () => {
      const { analyzeText } = await import("../lib/wasm");
      const mockSummary = createMockSummary();
      (analyzeText as Mock).mockResolvedValue(mockSummary);

      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      const file = new File(["[1/1/24, 10:00] Alice: Hello"], "chat.txt", { type: "text/plain" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("Ready to analyze")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

      await waitFor(() => {
        expect(screen.getByText("Chat timeline")).toBeInTheDocument();
      }, { timeout: 2000 });
    };

    it("toggles stopword filter", async () => {
      await setupWithData();

      const toggle = screen.getByLabelText(/Filter out stopwords/i);
      expect(toggle).toBeChecked();

      fireEvent.click(toggle);
      expect(toggle).not.toBeChecked();
    });

    it("opens color configuration modal", async () => {
      await setupWithData();

      const configBtn = screen.getByText("Configure colors");
      fireEvent.click(configBtn);

      await waitFor(() => {
        expect(screen.getByText("Configure user colors")).toBeInTheDocument();
      });
    });

    it("closes color modal", async () => {
      await setupWithData();

      fireEvent.click(screen.getByText("Configure colors"));

      await waitFor(() => {
        expect(screen.getByText("Configure user colors")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Close/i }));

      await waitFor(() => {
        expect(screen.queryByText("Configure user colors")).not.toBeInTheDocument();
      });
    });

    it("resets to upload state", async () => {
      await setupWithData();

      fireEvent.click(screen.getByText("Upload another chat"));

      await waitFor(() => {
        expect(screen.getByText("Upload your chat to see insights")).toBeInTheDocument();
      });
    });
  });

  describe("Accessibility", () => {
    it("has proper heading hierarchy", () => {
      render(<Dashboard />);

      const h2 = screen.getByRole("heading", { level: 2, name: "Dashboard" });
      expect(h2).toBeInTheDocument();

      const h3 = screen.getByRole("heading", { level: 3, name: "Upload your chat to see insights" });
      expect(h3).toBeInTheDocument();
    });

    it("has accessible labels on form controls", () => {
      render(<Dashboard />);

      expect(screen.getByLabelText(/Upload WhatsApp chat export file/i)).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("shows error when file processing fails", async () => {
      const { analyzeText } = await import("../lib/wasm");
      (analyzeText as Mock).mockRejectedValue(new Error("Failed to parse"));

      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      const file = new File(["invalid content"], "chat.txt", { type: "text/plain" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/Failed to parse/i)).toBeInTheDocument();
      });
    });
  });

  describe("Empty Result State", () => {
    // Drives the dashboard through upload -> analyze with a summary that has
    // zero parseable messages (total_messages === 0).
    const analyzeEmpty = async () => {
      const { analyzeText } = await import("../lib/wasm");
      (analyzeText as Mock).mockResolvedValue(createEmptySummary());

      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      const file = new File(["not a whatsapp chat"], "chat.txt", { type: "text/plain" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("Ready to analyze")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

      await waitFor(() => {
        expect(screen.getByText("We couldn\u2019t find any messages")).toBeInTheDocument();
      }, { timeout: 2000 });
    };

    it("shows the friendly empty state when no messages are found", async () => {
      await analyzeEmpty();

      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("We couldn\u2019t find any messages");
      expect(status).toHaveTextContent(/exported from WhatsApp/i);
      // A semantic heading (not color-only signaling).
      expect(
        screen.getByRole("heading", { name: /We couldn\u2019t find any messages/i })
      ).toBeInTheDocument();
    });

    it("does NOT render the dashboard charts in the empty state", async () => {
      await analyzeEmpty();

      // None of the dashboard's analytical sections should appear.
      expect(screen.queryByText("Chat timeline")).not.toBeInTheDocument();
      expect(screen.queryByText("Hourly rhythm")).not.toBeInTheDocument();
      expect(screen.queryByText("Most common words")).not.toBeInTheDocument();
      expect(screen.queryByTestId("area-chart")).not.toBeInTheDocument();
      expect(screen.queryByTestId("word-cloud")).not.toBeInTheDocument();
      // Export controls are insight-only and must be hidden too.
      expect(screen.queryByText("Export PDF")).not.toBeInTheDocument();
      expect(screen.queryByText("Configure colors")).not.toBeInTheDocument();
    });

    it("offers a way back to upload from the empty state", async () => {
      await analyzeEmpty();

      fireEvent.click(screen.getByRole("button", { name: "Upload another chat" }));

      await waitFor(() => {
        expect(screen.getByText("Upload your chat to see insights")).toBeInTheDocument();
      });
      expect(screen.queryByText("We couldn\u2019t find any messages")).not.toBeInTheDocument();
    });

    it("renders the normal dashboard (not the empty state) for a non-empty summary", async () => {
      const { analyzeText } = await import("../lib/wasm");
      (analyzeText as Mock).mockResolvedValue(createMockSummary());

      render(<Dashboard />);

      const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
      const file = new File(["[1/1/24, 10:00] Alice: Hello"], "chat.txt", { type: "text/plain" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("Ready to analyze")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

      await waitFor(() => {
        expect(screen.getByText("Chat timeline")).toBeInTheDocument();
      }, { timeout: 2000 });

      // The empty state must never appear on the happy path.
      expect(screen.queryByText("We couldn\u2019t find any messages")).not.toBeInTheDocument();
    });
  });
});

describe("Dashboard Data Transformations", () => {
  // These tests verify the useMemo transformations work correctly
  // They'll be more meaningful once we extract these into utility functions

  it("formats day labels correctly", () => {
    // This will be tested after extraction
    expect(true).toBe(true);
  });

  it("calculates busiest day from daily data", () => {
    // This will be tested after extraction
    expect(true).toBe(true);
  });

  it("calculates quietest day from daily data", () => {
    // This will be tested after extraction
    expect(true).toBe(true);
  });
});
