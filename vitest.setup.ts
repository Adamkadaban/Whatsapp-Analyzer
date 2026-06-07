import "@testing-library/jest-dom/vitest";

// jsdom (used by vitest) does not implement Blob/File async readers in all
// versions. The file-processing pipeline relies on File.prototype.text() and
// File.prototype.arrayBuffer() (e.g. zip extraction calls file.arrayBuffer()
// directly), so polyfill them when missing.
if (typeof File !== "undefined" && !File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function (this: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsArrayBuffer(this);
    });
  };
}

if (typeof File !== "undefined" && !File.prototype.text) {
  File.prototype.text = async function (this: File): Promise<string> {
    const buffer = await this.arrayBuffer();
    return new TextDecoder().decode(buffer);
  };
}
