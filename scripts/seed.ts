// Creates the demo user and preloads sample Operating Systems material.
// Usage: npm run seed   (needs .env.local with Supabase + Gemini keys)
import { readFileSync } from "node:fs";
import { hash } from "bcryptjs";
import { db } from "../src/lib/db";
import { ingest, type Kind } from "../src/lib/rag";

async function main() {
  await db.from("users").delete().eq("email", "demo@gapfinder.app");
  const { data: user, error } = await db.from("users")
    .insert({ email: "demo@gapfinder.app", name: "Demo Student", password_hash: await hash("Demo@1234", 10) }).select().single();
  if (error || !user) throw new Error(error?.message);
  const files: [string, string, Kind][] = [
    ["syllabus.md", "OS Syllabus", "syllabus"], ["notes.md", "OS Notes", "notes"], ["past_paper.md", "OS Past Paper", "past_paper"],
  ];
  for (const [file, title, kind] of files) {
    const r = await ingest(user.id, title, kind, [readFileSync(`sample/${file}`, "utf8")]);
    console.log(`Ingested ${title}: ${r.chunks} chunks`);
  }
  console.log("Done. Sign in with demo@gapfinder.app / Demo@1234, then build the topic map.");
}
main().catch((e) => { console.error(e); process.exit(1); });
