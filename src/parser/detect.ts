import jschardet from "jschardet";

export interface DetectResult {
  encoding: string;
  delimiter: string;
}

const DELIMITERS = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/** Max bytes to sample for encoding detection — 4KB is more than enough */
const ENCODING_SAMPLE_SIZE = 4096;

export function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Only sample the first few KB — charset detection doesn't need the whole file
  const sampleLen = Math.min(bytes.length, ENCODING_SAMPLE_SIZE);
  const codes = new Array<string>(sampleLen);
  for (let i = 0; i < sampleLen; i++) {
    codes[i] = String.fromCharCode(bytes[i]);
  }
  const binaryStr = codes.join("");

  const result = jschardet.detect(binaryStr);
  const enc = (result.encoding || "utf-8").toLowerCase();
  if (enc.includes("utf-8") || enc === "ascii") return "utf-8";
  if (enc.includes("gb") || enc.includes("gb2312") || enc.includes("gbk"))
    return "gbk";
  if (enc.includes("latin") || enc.includes("iso-8859") || enc.includes("windows-1252"))
    return "windows-1252";
  if (enc.includes("shift_jis") || enc.includes("shift-jis"))
    return "shift_jis";
  return enc;
}

export function detectDelimiter(text: string): Delimiter {
  // Find the end of the 10th line without splitting the entire string
  let pos = 0;
  for (let n = 0; n < 10 && pos < text.length; n++) {
    const next = text.indexOf("\n", pos);
    if (next === -1) { pos = text.length; break; }
    pos = next + 1;
  }
  const lines = text.substring(0, pos).split("\n");

  let best: Delimiter = ",";
  let bestScore = 0;

  for (const d of DELIMITERS) {
    const counts = lines
      .filter((l) => l.trim().length > 0)
      .map((l) => l.split(d).length - 1);
    if (counts.length === 0) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance =
      counts.reduce((a, c) => a + (c - avg) ** 2, 0) / counts.length;
    const score = avg > 0 ? avg / (1 + variance) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function detect(buffer: ArrayBuffer): DetectResult {
  const encoding = detectEncoding(buffer);
  const decoder = new TextDecoder(encoding);
  const text = decoder.decode(buffer);
  const delimiter = detectDelimiter(text);
  return { encoding, delimiter };
}
