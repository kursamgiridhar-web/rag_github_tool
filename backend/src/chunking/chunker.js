import { languageOf, categoryOf, layerOf } from "../ingestion/classify.js";

const MAX_LINES = 40;
const MAX_CHARS = 2000;
const OVERLAP = 8;

// Splits one file into overlapping chunks that remember their line numbers (1-based, inclusive).
export function chunkFile({ path, content }) {
  const lines = content.split(/\r?\n/);
  const meta = { filePath: path, language: languageOf(path), category: categoryOf(path), layer: layerOf(path) };
  const chunks = [];
  let start = 0;

  while (start < lines.length) {
    let end = start;
    let chars = 0;
    while (end < lines.length && end - start < MAX_LINES && (chars + lines[end].length < MAX_CHARS || end === start)) {
      chars += lines[end].length + 1;
      end++;
    }
    const text = lines.slice(start, end).join("\n");
    if (text.trim().length > 0) {
      chunks.push({ ...meta, startLine: start + 1, endLine: end, text });
    }
    if (end >= lines.length) break;
    start = Math.max(end - OVERLAP, start + 1);
  }
  return chunks;
}

// Text that gets embedded: file path gives the model useful context about the code
export function embeddingTextOf(chunk) {
  return `File: ${chunk.filePath}\n${chunk.text}`;
}
