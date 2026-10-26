import { db } from "./db";
import { embed } from "./ai";
import { chunkPages } from "./chunk";

export type Kind = "syllabus" | "notes" | "textbook" | "past_paper";
export type Passage = { id: string; section: string; content: string; doc_title: string; similarity: number };

const MIN_SIMILARITY = Number(process.env.MIN_SIMILARITY ?? 0.45);

/** Ingestion: chunk -> embed -> store. Nothing here calls a generative model. */
export async function ingest(userId: string, title: string, kind: Kind, pages: string[]) {
  const { data: doc, error } = await db.from("documents").insert({ user_id: userId, title, kind }).select().single();
  if (error || !doc) throw new Error(error?.message ?? "Could not save document");
  const chunks = chunkPages(pages, title);
  if (!chunks.length) throw new Error("No readable text found in this file.");
  const vectors = await embed(chunks.map((c) => `${c.section}\n${c.content}`), "RETRIEVAL_DOCUMENT");
  const { error: cErr } = await db.from("chunks").insert(
    chunks.map((c, i) => ({
      document_id: doc.id, user_id: userId, position: i, section: c.section, content: c.content,
      embedding: JSON.stringify(vectors[i]),
    })),
  );
  if (cErr) throw new Error(cErr.message);
  return { id: doc.id as string, chunks: chunks.length };
}

/** Retrieval: the only way material reaches a prompt. Returns [] when nothing is similar enough. */
export async function retrieve(userId: string, query: string, k = 5, kinds?: Kind[]): Promise<Passage[]> {
  const [vec] = await embed([query], "RETRIEVAL_QUERY");
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: JSON.stringify(vec), match_user: userId, match_count: k, kinds: kinds ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Passage[]).filter((p) => p.similarity >= MIN_SIMILARITY);
}

export const cite = (p: Passage) => `${p.doc_title} — ${p.section}`;
export const asContext = (ps: Passage[]) => ps.map((p, i) => `[${i}] (${cite(p)})\n${p.content}`).join("\n\n");
