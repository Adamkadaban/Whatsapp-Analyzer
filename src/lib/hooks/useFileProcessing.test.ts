import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFileProcessing } from "./useFileProcessing";

describe("useFileProcessing", () => {
  const mockAnalyzeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzeText.mockResolvedValue({
      total_messages: 10,
      by_sender: [],
      daily: [],
      hourly: [],
      top_emojis: [],
      top_words: [],
      top_words_no_stop: [],
    });
  });

  describe("Basic functionality", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      expect(result.current.state.processing).toBe(false);
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.fileName).toBeNull();
      expect(result.current.state.fileCount).toBe(0);
      expect(result.current.state.pendingSummary).toBeNull();
    });

    it("should reset state", () => {
      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.processing).toBe(false);
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.fileName).toBeNull();
      expect(result.current.state.fileCount).toBe(0);
      expect(result.current.state.pendingSummary).toBeNull();
    });

    it("should ignore an empty file list", async () => {
      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([]);
      });

      expect(mockAnalyzeText).not.toHaveBeenCalled();
      expect(result.current.state.processing).toBe(false);
    });
  });

  describe("UTF-8 text file processing", () => {
    it("should process a valid UTF-8 .txt file and surface the pending summary", async () => {
      const content = "[01/01/23, 10:00:00 AM] Alice: Hello\n[01/01/23, 10:01:00 AM] Bob: Hi there!";
      const file = new File([content], "chat.txt", { type: "text/plain" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledWith(content);
      await waitFor(() => {
        expect(result.current.state.fileName).toBe("chat.txt");
        expect(result.current.state.fileCount).toBe(1);
        expect(result.current.state.pendingSummary).not.toBeNull();
        expect(result.current.state.error).toBeNull();
        expect(result.current.state.processing).toBe(false);
      });
    });

    it("should set processing to true while analysis is in flight", async () => {
      const file = new File(["[1/1/24, 10:00] Alice: hi there friend"], "chat.txt", { type: "text/plain" });

      // Hold the analysis open so we can observe the in-flight state.
      let resolveAnalyze!: (value: unknown) => void;
      mockAnalyzeText.mockImplementation(
        () => new Promise((resolve) => { resolveAnalyze = resolve; })
      );

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      let processPromise!: Promise<void>;
      act(() => {
        processPromise = result.current.processFiles([file]);
      });

      // Wait until the (async) file read finishes and analyzeText is invoked;
      // at that point the hook is mid-flight and resolveAnalyze is wired up.
      await waitFor(() => {
        expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      });
      expect(result.current.state.processing).toBe(true);

      await act(async () => {
        resolveAnalyze({ total_messages: 1 });
        await processPromise;
      });

      expect(result.current.state.processing).toBe(false);
      expect(result.current.state.pendingSummary).not.toBeNull();
    });
  });

  describe("UTF-16 encoding fallback", () => {
    it("should still recover readable text from a UTF-16LE encoded file", async () => {
      const content = "Conversation exported in UTF-16 encoding";
      // Build a UTF-16LE buffer (little-endian: low byte first).
      const utf16 = new Uint8Array(content.length * 2);
      for (let i = 0; i < content.length; i++) {
        utf16[i * 2] = content.charCodeAt(i) & 0xff;
        utf16[i * 2 + 1] = (content.charCodeAt(i) >> 8) & 0xff;
      }

      const file = new File([utf16], "chat.txt", { type: "text/plain" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      // The pipeline must not reject UTF-16 input; the readable characters are
      // preserved (interspersed NUL bytes from the UTF-8 path are stripped here
      // only for the assertion).
      const decoded = (mockAnalyzeText.mock.calls[0][0] as string).split("\u0000").join("");
      expect(decoded).toContain("UTF-16 encoding");
    });
  });

  describe("ZIP file processing", () => {
    it("should extract and combine .txt files from a zip", async () => {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      const content1 = "[01/01/23, 10:00:00 AM] Alice: Hello from file 1";
      const content2 = "[01/01/23, 10:05:00 AM] Bob: Hello from file 2";

      zip.file("chat1.txt", content1);
      zip.file("chat2.txt", content2);

      const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
      const file = new File([zipBuffer], "chats.zip", { type: "application/zip" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      const combinedText = mockAnalyzeText.mock.calls[0][0] as string;
      expect(combinedText).toContain("Alice: Hello from file 1");
      expect(combinedText).toContain("Bob: Hello from file 2");
    });

    it("should error when a zip contains no .txt files", async () => {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      zip.file("readme.md", "This is a markdown file");
      zip.file("data.json", "{}");

      const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
      const file = new File([zipBuffer], "invalid.zip", { type: "application/zip" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.state.error).toContain("No text found");
      });
    });

    it("should skip directory entries inside a zip", async () => {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      zip.folder("subfolder");
      zip.file("chat.txt", "[1/1/24, 10:00] Alice: Valid content here");

      const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
      const file = new File([zipBuffer], "chats.zip", { type: "application/zip" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeText.mock.calls[0][0]).toContain("Valid content here");
    });

    it("should surface an error for a malformed zip", async () => {
      const invalidZip = new File(["this is definitely not a zip archive"], "invalid.zip", {
        type: "application/zip",
      });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([invalidZip]);
      });

      expect(mockAnalyzeText).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.state.error).toBeTruthy();
      });
    });
  });

  describe("Multiple file processing", () => {
    it("should combine multiple .txt files into one analysis call", async () => {
      const file1 = new File(["[1/1/24, 1:00] A: Chat 1 content"], "chat1.txt", { type: "text/plain" });
      const file2 = new File(["[1/1/24, 2:00] B: Chat 2 content"], "chat2.txt", { type: "text/plain" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file1, file2]);
      });

      expect(result.current.state.fileCount).toBe(2);
      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      const combined = mockAnalyzeText.mock.calls[0][0] as string;
      expect(combined).toContain("Chat 1 content");
      expect(combined).toContain("Chat 2 content");
    });

    it("should keep good files and skip ones that are unreadable", async () => {
      const validFile = new File(["[1/1/24, 1:00] A: Valid chat content"], "valid.txt", { type: "text/plain" });
      // A truly empty (0-byte) file decodes to nothing under every encoding and
      // is reported as skipped/unreadable.
      const emptyFile = new File([""], "empty.txt", { type: "text/plain" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([validFile, emptyFile]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      const combined = mockAnalyzeText.mock.calls[0][0] as string;
      expect(combined).toContain("Valid chat content");
      // The empty file should still produce a "skipped" warning surfaced via error.
      await waitFor(() => {
        expect(result.current.state.error).toContain("skipped");
      });
    });

    it("should strip invisible characters while preserving ZWJ in emoji", async () => {
      const contentWithInvisibles = "Hello\u200bWorld\u200d\u{1f468}\u200d\u{1f469}\u200d\u{1f467}";
      const file = new File([contentWithInvisibles], "chat.txt", { type: "text/plain" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      const processed = mockAnalyzeText.mock.calls[0][0] as string;
      expect(processed).not.toContain("\u200b"); // zero-width space removed
      expect(processed).toContain("\u200d"); // ZWJ preserved for compound emoji
    });
  });

  describe("Error handling", () => {
    it("should surface analysis errors", async () => {
      const file = new File(["[1/1/24, 1:00] A: Valid content"], "chat.txt", { type: "text/plain" });
      mockAnalyzeText.mockRejectedValue(new Error("Analysis failed"));

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.state.error).toContain("Analysis failed");
        expect(result.current.state.processing).toBe(false);
        expect(result.current.state.fileName).toBeNull();
        expect(result.current.state.fileCount).toBe(0);
      });
    });

    it("should show the 'trouble reading' error when every file is unreadable", async () => {
      // Two 0-byte files: both fail the utf-8/utf-16 decode and are flagged as
      // unreadable, which triggers the encoding-specific error message.
      const emptyFile1 = new File([""], "empty1.txt", { type: "text/plain" });
      const emptyFile2 = new File([""], "empty2.txt", { type: "text/plain" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([emptyFile1, emptyFile2]);
      });

      expect(mockAnalyzeText).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.state.error).toContain("trouble reading");
      });
    });
  });

  describe("File type handling", () => {
    it("should accept a .txt extension regardless of MIME type", async () => {
      const file = new File(["[1/1/24, 1:00] A: Chat content"], "chat.txt", {
        type: "application/octet-stream",
      });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
    });

    it("should reject unsupported file types", async () => {
      const file = new File(["Some content"], "document.pdf", { type: "application/pdf" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.state.error).toContain("No text found");
        expect(result.current.state.error).toContain("unsupported type");
      });
    });
  });

  describe("Encoding edge cases", () => {
    it("should strip a leading BOM marker", async () => {
      const content = "\uFEFF[1/1/24, 1:00] A: Chat with BOM";
      const file = new File([content], "chat.txt", { type: "text/plain" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      const processed = mockAnalyzeText.mock.calls[0][0] as string;
      expect(processed).not.toContain("\uFEFF");
      expect(processed).toContain("Chat with BOM");
    });

    it("should handle mixed visible and invisible characters", async () => {
      const content = "Hello\u200bWorld\u200cTest\u200e! [1/1/24, 1:00] A: message";
      const file = new File([content], "chat.txt", { type: "text/plain" });

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([file]);
      });

      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
      const processed = mockAnalyzeText.mock.calls[0][0] as string;
      expect(processed).not.toContain("\u200b");
      expect(processed).not.toContain("\u200c");
      expect(processed).not.toContain("\u200e");
    });
  });

  describe("State management", () => {
    it("should clear a previous error when processing new valid files", async () => {
      const badFile = new File([""], "empty.txt", { type: "text/plain" });
      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles([badFile]);
      });
      await waitFor(() => {
        expect(result.current.state.error).toBeTruthy();
      });

      const goodFile = new File(["[1/1/24, 1:00] A: Valid content"], "chat.txt", { type: "text/plain" });
      await act(async () => {
        await result.current.processFiles([goodFile]);
      });

      await waitFor(() => {
        expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
        expect(result.current.state.error).toBeNull();
        expect(result.current.state.pendingSummary).not.toBeNull();
      });
    });

    it("should label fileName as 'N files' for multiple inputs", async () => {
      const files = [
        new File(["[1/1/24, 1:00] A: one"], "a.txt", { type: "text/plain" }),
        new File(["[1/1/24, 1:00] B: two"], "b.txt", { type: "text/plain" }),
        new File(["[1/1/24, 1:00] C: three"], "c.txt", { type: "text/plain" }),
      ];

      const { result } = renderHook(() => useFileProcessing(mockAnalyzeText));

      await act(async () => {
        await result.current.processFiles(files);
      });

      expect(result.current.state.fileCount).toBe(3);
      expect(mockAnalyzeText).toHaveBeenCalledTimes(1);
    });
  });
});
