/** JSZip builder */
import JSZip from "jszip";
import * as fs from "fs";

export async function buildZip(opts: {
  clipPath: string;
  thumbData: Buffer;
  notesContent: string;
}): Promise<Buffer> {
  const zip = new JSZip();
  const clipData = fs.readFileSync(opts.clipPath);
  zip.file("clip.mp4", clipData);
  zip.file("thumb.jpg", opts.thumbData);
  zip.file("notes.md", opts.notesContent);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
