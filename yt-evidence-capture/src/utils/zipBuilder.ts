/**
 * Zip archive builder using JSZip.
 * Reads the clip from disk, accepts thumbnail as a Buffer,
 * and inlines the notes.md text. Returns a Node.js Buffer.
 */
import * as fs from "fs";
import JSZip from "jszip";

export interface ZipParams {
  clipPath: string;       // Absolute path to clip.mp4 on disk
  thumbData: Buffer;      // Thumbnail image bytes
  notesContent: string;   // Full notes.md text
}

/**
 * Build a .zip archive containing clip.mp4, thumb.jpg, and notes.md.
 * Returns the zip as a Node.js Buffer ready to write to the vault.
 */
export async function buildZip(params: ZipParams): Promise<Buffer> {
  const zip = new JSZip();

  // Video clip — may be large; read as binary Buffer
  const clipBuffer = fs.readFileSync(params.clipPath);
  zip.file("clip.mp4", clipBuffer, { binary: true });

  // Thumbnail
  zip.file("thumb.jpg", params.thumbData, { binary: true });

  // Notes markdown
  zip.file("notes.md", params.notesContent, { binary: false });

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  }) as Promise<Buffer>;
}
