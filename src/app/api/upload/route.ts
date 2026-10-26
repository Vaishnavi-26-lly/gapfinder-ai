import { extractText, getDocumentProxy } from "unpdf";
import { handle } from "@/lib/api";
import { ingest, type Kind } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (req: Request) => handle(async (userId) => {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const kind = form.get("kind") as Kind;
  if (!file || !["syllabus", "notes", "textbook", "past_paper"].includes(kind)) throw new Error("Choose a file and a material type.");
  let pages: string[];
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    pages = (await extractText(pdf, { mergePages: false })).text;
  } else {
    pages = [await file.text()];
  }
  return ingest(userId, file.name.replace(/\.[^.]+$/, ""), kind, pages);
});
