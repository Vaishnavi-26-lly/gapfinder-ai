import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
export const llm = google(process.env.GEMINI_MODEL ?? "gemini-2.5-flash");

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

/** Embeds texts at 768 dimensions (matches vector(768) in schema.sql). */
export async function embed(texts: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((t) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: t }] },
            taskType: task,
            outputDimensionality: 768,
          })),
        }),
      },
    );
    if (!res.ok) throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as { embeddings: { values: number[] }[] };
    out.push(...json.embeddings.map((e) => e.values));
  }
  return out;
}
