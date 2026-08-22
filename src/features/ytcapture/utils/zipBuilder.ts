/** JSZip builder */
import JSZip from "jszip";
import { getNodeFs } from "../../../utils/nodeHelpers";

export async function buildZip(opts: {
  clipPath: string;
  thumbData: any;
  notesContent: string;
}): Promise<any> {
  const zip = new JSZip();
  const fs = getNodeFs();
  if (fs) {
    const clipData = fs.readFileSync(opts.clipPath);
    zip.file("clip.mp4", clipData);
  }
  zip.file("thumb.jpg", opts.thumbData);
  zip.file("notes.md", opts.notesContent);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
