/**
 * Which changed files earn an image preview in the review pane.
 *
 * Bitmaps reach us as binary, so the host sends no patch and the preview is
 * the only thing to show. SVG is text: the host sends a patch, and before
 * this a changed icon read as a wall of markup with no picture anywhere. So
 * SVG counts as previewable even when a patch exists, and its patch still
 * renders underneath the preview (see buildReviewItems) because the path data
 * is the part a reviewer comments on.
 */
import type { ChangedFile } from "../types.ts";
import { imageMimeFor, SVG_MIME } from "./mime.ts";

export function isImageFile(file: ChangedFile): boolean {
  const mime = imageMimeFor(file.filename);
  if (mime === null) {
    return false;
  }
  return mime === SVG_MIME || !file.patch;
}
