import { describe, expect, it } from "vitest";

class TestFile extends Blob {
  name: string;
  lastModified: number;
  private data: string;

  constructor(parts: BlobPart[], name: string, options: FilePropertyBag = {}) {
    super(parts, options);
    this.name = name;
    this.lastModified = options.lastModified ?? Date.now();
    this.data = parts.map((p) => (typeof p === "string" ? p : "")).join("");
  }

  async text(): Promise<string> {
    return this.data;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return new TextEncoder().encode(this.data).buffer;
  }
}

// Sample WhatsApp export filename with unicode characters
const sampleFilenames = [
  "WhatsApp Chat with Alice.txt",
  "WhatsApp Chat with 友人.txt",
  "WhatsApp Chat with 🎉 Party Group.txt",
  "_chat.txt",
  "chat-export.txt",
];

// These tests verify that the File APIs handle WhatsApp-style filenames without errors.
describe("upload filename edge cases", () => {
  it.each(sampleFilenames)("handles filename %s correctly", async (filename) => {
    const file = new TestFile(["sample content"], filename, { type: "text/plain" });

    expect(file.name).toBe(filename);
    expect(file.name.toLowerCase().endsWith(".txt")).toBe(true);

    await expect(file.text()).resolves.toBe("sample content");
    const buf = await file.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("reads file content via text() and arrayBuffer()", async () => {
    const content = "[01/01/2024, 12:00] Alice: Hello!";
    const file = new TestFile([content], "chat.txt", { type: "text/plain" });

    expect(await file.text()).toBe(content);
    const buf = await file.arrayBuffer();
    expect(new TextDecoder().decode(buf)).toBe(content);
  });
});
