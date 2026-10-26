export type RawChunk = { section: string; content: string };

const HEADING = /^(#{1,3}\s+.+|(unit|chapter|module|topic)\s+\d+\s*[:.\-].*)$/i;

/** Splits pages into ~900-char chunks on paragraph boundaries; each chunk keeps its heading and page for citations. */
export function chunkPages(pages: string[], title: string, size = 900): RawChunk[] {
  const chunks: RawChunk[] = [];
  let heading = title;
  pages.forEach((page, pi) => {
    let buf = "";
    let carry = "";
    const label = () => `${heading} (p.${pi + 1})`;
    const flush = () => {
      if (buf.trim()) chunks.push({ section: label(), content: buf.trim() });
      carry = buf.split("\n\n").pop() ?? "";
      buf = "";
    };
    for (const para of page.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
      if (para.length < 100 && !para.includes("\n") && HEADING.test(para)) {
        flush();
        carry = "";
        heading = para.replace(/^#+\s*/, "");
        continue;
      }
      if (buf && buf.length + para.length > size) {
        flush();
        if (carry.length < size / 3) buf = carry + "\n\n"; // one-paragraph overlap
      }
      buf += (buf && !buf.endsWith("\n\n") ? "\n\n" : "") + para;
    }
    flush();
  });
  return chunks;
}
