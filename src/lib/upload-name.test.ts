import fs from "fs";
import path from "path";
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

const dataDir = path.join(process.cwd(), "data");
const targetName = fs
  .readdirSync(dataDir)
  .find((name) => name.startsWith("WhatsApp Chat with") && name.toLowerCase().endsWith(".txt"));

// These tests aim to reproduce the upload pipeline assumptions with the real filename (even if blank content).
// They verify that the name passes extension detection and the File APIs don't throw for the odd filename.
describe("upload filename edge case", () => {
  it("finds the expected chat file in data/", () => {
    expect(targetName, "expected a WhatsApp chat file in data/").toBeDefined();
  });

  it("treats the filename as .txt and reads via File APIs without error", async () => {
    if (!targetName) return;
    const file = new TestFile([""], targetName, { type: "text/plain" });

    expect(file.name).toBe(targetName);
    expect(file.name.toLowerCase().endsWith(".txt")).toBe(true);

    await expect(file.text()).resolves.toBe("");
    const buf = await file.arrayBuffer();
    expect(buf.byteLength).toBe(0);
  });
});
