/**
 * REGRESSION SAFETY NET for src/pages/Dashboard.tsx
 *
 * Purpose: lock down the *observable behaviour* and the *visual/DOM structure*
 * of the Dashboard so that an upcoming refactor (which may split Dashboard into
 * smaller sub-components) can be verified to preserve behaviour.
 *
 * Design rules that keep this resilient to a component-boundary refactor:
 *  - Query by ROLE / TEXT / TESTID — never by brittle DOM paths or nth-child.
 *  - Assert *what the user sees* (section headers, KPI labels, controls,
 *    conditional sections appearing/disappearing), not implementation details.
 *  - Snapshots are NORMALIZED structural trees (tag + class + role + testid,
 *    with all text content stripped), so they survive code re-organisation that
 *    preserves output, while still flagging real structural/visual changes.
 *
 * Charts (recharts), WordCloud, EmojiCloud and JSZip are mocked exactly like
 * the existing Dashboard.test.tsx so the rendered DOM is deterministic.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import Dashboard from "./Dashboard";
import {
  createMockSummary,
  createEmptySummary,
} from "../lib/__fixtures__/mockSummary";
import type { Summary } from "../lib/types";

// ---- Mocks (mirror Dashboard.test.tsx so DOM is deterministic) -------------

vi.mock("../lib/wasm", () => ({
  analyzeText: vi.fn(),
  preloadWorker: vi.fn(),
}));

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

vi.mock("jszip", () => ({
  default: { loadAsync: vi.fn() },
}));

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

// ---- Helpers ---------------------------------------------------------------

/**
 * Drives the real upload -> ready -> analyze flow with a provided Summary and
 * resolves once the data view has rendered. This exercises the same code path
 * a user would, so it stays valid no matter how the internals are refactored.
 */
async function loadDashboard(summary: Summary) {
  const { analyzeText } = await import("../lib/wasm");
  (analyzeText as Mock).mockResolvedValue(summary);

  const view = render(<Dashboard />);

  const fileInput = screen.getByLabelText(/Upload WhatsApp chat export file/i);
  const file = new File(["[1/1/24, 10:00] Alice: Hello"], "chat.txt", {
    type: "text/plain",
  });
  fireEvent.change(fileInput, { target: { files: [file] } });

  await waitFor(() => {
    expect(screen.getByText("Ready to analyze")).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

  // "Chat timeline" is a stable, always-present header in the data view.
  await waitFor(
    () => {
      expect(screen.getByText("Chat timeline")).toBeInTheDocument();
    },
    { timeout: 2000 },
  );

  return view;
}

/**
 * Serializes an element subtree to a normalized structural string:
 *   tag#id.class1.class2[role=..][data-testid=..]
 * indented by depth, with ALL text content and volatile attributes (style,
 * inline values, aria-labels containing data) stripped.
 *
 * Why this shape: a refactor that splits Dashboard into sub-components but
 * preserves output produces the IDENTICAL tree here, so the snapshot does not
 * churn on harmless reorganisation — but any change to the *visual structure*
 * (a card removed, nesting changed, a section reordered) is caught.
 */
function normalizeTree(root: Element): string {
  const lines: string[] = [];

  const walk = (el: Element, depth: number) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = el.getAttribute("class");
    const classPart = cls
      ? "." + cls.trim().split(/\s+/).sort().join(".")
      : "";
    const role = el.getAttribute("role");
    const testid = el.getAttribute("data-testid");
    const attrs = [
      role ? `role=${role}` : "",
      testid ? `testid=${testid}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const attrPart = attrs ? `[${attrs}]` : "";

    lines.push(`${"  ".repeat(depth)}${tag}${id}${classPart}${attrPart}`);
    Array.from(el.children).forEach((child) => walk(child, depth + 1));
  };

  walk(root, 0);
  return lines.join("\n");
}

/**
 * A compact, semantic "landmark outline" of the dashboard: the ordered list of
 * section tags (`.tag`), card headers (`.card-header`) and chart-card titles.
 * This is the most refactor-resilient artifact — it captures which sections
 * exist and in what order, independent of DOM nesting.
 */
function landmarkOutline(root: Element): string {
  const out: string[] = [];
  root.querySelectorAll(".tag, .card-header, .journey-title").forEach((el) => {
    const kind = el.classList.contains("tag")
      ? "tag"
      : el.classList.contains("journey-title")
        ? "journey"
        : "header";
    out.push(`${kind}: ${el.textContent?.trim()}`);
  });
  return out.join("\n");
}

// ---- Tests -----------------------------------------------------------------

describe("Dashboard regression net", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Functional: full representative summary", () => {
    it("renders every major section, card and the controls", async () => {
      const { container } = await loadDashboard(createMockSummary());

      // Title / header
      expect(
        screen.getByRole("heading", { level: 2, name: "Dashboard" }),
      ).toBeInTheDocument();

      // Timeline
      expect(screen.getByText("Chat timeline")).toBeInTheDocument();
      expect(screen.getByText("Message volume over time.")).toBeInTheDocument();

      // Per-person stats table + its columns
      expect(screen.getByText("Per-person stats")).toBeInTheDocument();
      const table = screen.getByRole("table");
      const head = within(table);
      ["Person", "Total words", "Unique words", "Avg words/msg", "Longest msg (words)", "Top emojis"].forEach(
        (col) => expect(head.getByText(col)).toBeInTheDocument(),
      );
      // Each sender appears as a row
      expect(head.getByText("Alice")).toBeInTheDocument();
      expect(head.getByText("You")).toBeInTheDocument();

      // KPI cards (all eight, including busiest AND quietest day)
      [
        "Total messages",
        "Active days",
        "Busiest day",
        "Quietest day",
        "Longest streak",
        "Conversation starts",
        "Top emoji",
        "Top word",
      ].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
      // A KPI value derived from data — scoped to the "Total messages" card
      // ("15,432" also appears in the journey overview, hence the scoping).
      const totalCard = screen.getByText("Total messages").closest(".card");
      expect(totalCard).not.toBeNull();
      expect(within(totalCard as HTMLElement).getByText("15,432")).toBeInTheDocument();

      // Distribution / rhythm charts
      expect(screen.getByText("Hourly rhythm")).toBeInTheDocument();
      expect(screen.getByText("Top senders")).toBeInTheDocument();
      expect(screen.getByText("Messages by person")).toBeInTheDocument();
      expect(screen.getByText("Conversation starters")).toBeInTheDocument();
      expect(screen.getByText("Monthly footprint")).toBeInTheDocument();
      expect(screen.getByText("Weekday footprint")).toBeInTheDocument();

      // Sentiment section (present because fixture has sentiment data)
      expect(screen.getByText("Mood lanes by person")).toBeInTheDocument();
      expect(screen.getByText("Polarity mix per person")).toBeInTheDocument();
      expect(screen.getByText("Overall mood drift")).toBeInTheDocument();

      // Phrases + clouds
      expect(screen.getByText("Top phrases per sender")).toBeInTheDocument();
      expect(screen.getByText("Most common words")).toBeInTheDocument();
      expect(screen.getByTestId("word-cloud")).toBeInTheDocument();
      expect(screen.getByText("Most used emojis")).toBeInTheDocument();
      expect(screen.getByTestId("emoji-cloud")).toBeInTheDocument();

      // Journey section (present because fixture has journey data)
      expect(screen.getByText("Journey Through Your Messages")).toBeInTheDocument();
      expect(screen.getByText("Where it all began")).toBeInTheDocument();
      expect(screen.getByText("The latest chapter")).toBeInTheDocument();
      expect(screen.getByText("Memorable moments")).toBeInTheDocument();

      // Controls: stop-word toggle, configure colors, export pdf, upload another
      const stopToggle = screen.getByLabelText(/Filter out stopwords/i);
      expect(stopToggle).toBeInTheDocument();
      expect(stopToggle).toBeChecked();

      const configBtn = screen.getByRole("button", { name: "Configure colors" });
      expect(configBtn).toBeEnabled();

      const exportBtn = screen.getByRole("button", { name: "Export PDF" });
      expect(exportBtn).toBeInTheDocument();
      expect(exportBtn).toBeEnabled();

      expect(
        screen.getByRole("button", { name: "Upload another chat" }),
      ).toBeEnabled();

      // The upload UI must NOT be present once data is loaded
      expect(
        screen.queryByText("Upload your chat to see insights"),
      ).not.toBeInTheDocument();

      // sanity: clouds received the fixture data
      expect(container.querySelector('[data-testid="word-cloud"]')).toHaveAttribute(
        "data-word-count",
        "50",
      );
      expect(container.querySelector('[data-testid="emoji-cloud"]')).toHaveAttribute(
        "data-word-count",
        "8",
      );
    });

    it("toggling stop-words swaps the word statistics", async () => {
      await loadDashboard(createMockSummary());

      const toggle = screen.getByLabelText(/Filter out stopwords/i);
      expect(toggle).toBeChecked();

      // With stop-words filtered ON the top word is the raw top word "the";
      // the no-stop top word "lol" is not shown as a KPI value yet.
      expect(screen.getByText("the")).toBeInTheDocument();
      expect(screen.queryByText("lol")).not.toBeInTheDocument();

      fireEvent.click(toggle);

      expect(toggle).not.toBeChecked();
      expect(screen.getByText("lol")).toBeInTheDocument();
      expect(screen.queryByText("the")).not.toBeInTheDocument();
    });

    it("opens and closes the colour configuration modal", async () => {
      await loadDashboard(createMockSummary());

      fireEvent.click(screen.getByRole("button", { name: "Configure colors" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Configure user colors")).toBeInTheDocument();
      // Per-person colour pickers are present
      expect(
        within(dialog).getByLabelText(/Choose color for Alice/i),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByLabelText(/Choose color for You/i),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Close/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  describe("Functional: conditional sections", () => {
    it("hides the sentiment section when there is no sentiment data (keeps journey)", async () => {
      const summary: Summary = {
        ...createMockSummary(),
        sentiment_by_day: [],
        sentiment_overall: [],
      };
      await loadDashboard(summary);

      // Sentiment charts gone...
      expect(screen.queryByText("Mood lanes by person")).not.toBeInTheDocument();
      expect(screen.queryByText("Polarity mix per person")).not.toBeInTheDocument();
      expect(screen.queryByText("Overall mood drift")).not.toBeInTheDocument();

      // ...but journey + the rest stay.
      expect(
        screen.getByText("Journey Through Your Messages"),
      ).toBeInTheDocument();
      expect(screen.getByText("Chat timeline")).toBeInTheDocument();
    });

    it("hides the journey section when there is no journey data (keeps sentiment)", async () => {
      const summary: Summary = { ...createMockSummary(), journey: undefined };
      await loadDashboard(summary);

      expect(
        screen.queryByText("Journey Through Your Messages"),
      ).not.toBeInTheDocument();

      // Sentiment + the rest stay.
      expect(screen.getByText("Mood lanes by person")).toBeInTheDocument();
      expect(screen.getByText("Chat timeline")).toBeInTheDocument();
    });
  });

  describe("Functional: empty / near-empty summary", () => {
    it("renders the dashboard shell and hides all optional sections", async () => {
      const { container } = await loadDashboard(createEmptySummary());

      // Shell sections that always render with data present
      expect(screen.getByText("Chat timeline")).toBeInTheDocument();
      expect(screen.getByText("Per-person stats")).toBeInTheDocument();
      expect(screen.getByText("Top phrases per sender")).toBeInTheDocument();
      expect(screen.getByText("Most common words")).toBeInTheDocument();
      expect(screen.getByText("Most used emojis")).toBeInTheDocument();

      // KPI labels still present (values fall back to placeholders)
      expect(screen.getByText("Total messages")).toBeInTheDocument();
      expect(screen.getByText("Top word")).toBeInTheDocument();

      // Optional sections hidden because their data is empty/absent
      expect(screen.queryByText("Mood lanes by person")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Journey Through Your Messages"),
      ).not.toBeInTheDocument();

      // Empty clouds + phrases empty-state
      expect(container.querySelector('[data-testid="word-cloud"]')).toHaveAttribute(
        "data-word-count",
        "0",
      );
      expect(container.querySelector('[data-testid="emoji-cloud"]')).toHaveAttribute(
        "data-word-count",
        "0",
      );
      expect(screen.getByText("No phrases yet.")).toBeInTheDocument();

      // Controls are still rendered (data view active)
      expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();

      // Structural snapshot of the empty/near-empty data view
      const main = container.querySelector("main");
      expect(main).not.toBeNull();
      expect(normalizeTree(main as Element)).toMatchSnapshot(
        "empty-summary-structure",
      );
    });
  });

  describe("Visual structure: pre-render upload state", () => {
    it("matches the structural snapshot of the upload (no-data) view", () => {
      const { container } = render(<Dashboard />);
      const main = container.querySelector("main");
      expect(main).not.toBeNull();
      expect(normalizeTree(main as Element)).toMatchSnapshot(
        "upload-view-structure",
      );
    });
  });

  describe("Visual structure: full data view", () => {
    it("matches the normalized DOM-structure and landmark snapshots", async () => {
      const { container } = await loadDashboard(createMockSummary());
      const main = container.querySelector("main");
      expect(main).not.toBeNull();

      // (1) Full normalized structural tree — catches any change to the
      // rendered DOM shape (cards added/removed/reordered/renested).
      expect(normalizeTree(main as Element)).toMatchSnapshot(
        "full-data-structure",
      );

      // (2) Semantic landmark outline — the ordered section/header map.
      expect(landmarkOutline(main as Element)).toMatchSnapshot(
        "full-data-landmarks",
      );
    });
  });
});
