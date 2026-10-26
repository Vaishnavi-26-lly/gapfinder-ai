import { generateObject, generateText } from "ai";
import { z } from "zod";
import { db } from "./db";
import { llm } from "./ai";
import { retrieve, cite, asContext } from "./rag";
 
export type Rating = "weak" | "medium" | "strong";
/** Ratings come from arithmetic, never from the LLM, so the diagnosis is measurable. */
export const rate = (acc: number): Rating => (acc >= 0.8 ? "strong" : acc >= 0.5 ? "medium" : "weak");
 
const GROUND = "Use ONLY the numbered passages provided. Do not use outside knowledge.";
 
/* ---------- Topic map (generation over the syllabus text) ---------- */
export async function buildTopicMap(userId: string) {
  const { data: docs } = await db.from("documents").select("id").eq("user_id", userId).eq("kind", "syllabus");
  if (!docs?.length) throw new Error("Upload a syllabus first.");
  const { data: chunks } = await db.from("chunks").select("content").in("document_id", docs.map((d) => d.id)).order("position");
  const text = (chunks ?? []).map((c) => c.content).join("\n\n").slice(0, 30000);
  const { object } = await generateObject({
    model: llm,
    schema: z.object({ topics: z.array(z.object({ name: z.string(), description: z.string() })).min(1).max(15) }),
    prompt: `Extract the distinct, examinable topics from this syllabus (max 15). Give each a short name and a one-sentence description of what it covers.\n\n${text}`,
  });
  await db.from("topics").delete().eq("user_id", userId);
  const { data } = await db.from("topics").insert(object.topics.map((t, i) => ({ ...t, user_id: userId, position: i }))).select();
  return data;
}
 
/* ---------- Diagnostic quiz (retrieve per topic, then ONE generation call) ---------- */
async function latestScores(userId: string) {
  const { data: last } = await db.from("attempts").select("id").eq("user_id", userId).eq("status", "graded")
    .order("created_at", { ascending: false }).limit(1);
  const map = new Map<string, Rating>();
  if (last?.[0]) {
    const { data } = await db.from("topic_scores").select("topic_id,rating").eq("attempt_id", last[0].id);
    (data ?? []).forEach((s) => map.set(s.topic_id, s.rating));
  }
  return map;
}
 
export async function createQuiz(userId: string) {
  const { data: topics } = await db.from("topics").select("*").eq("user_id", userId).order("position");
  if (!topics?.length) throw new Error("Build the topic map first.");
  const prev = await latestScores(userId);
 
  // Later attempts are adaptive: more questions on weak topics, fewer on strong ones.
  const plans = await Promise.all(topics.map(async (t) => ({
    topic: t,
    n: { weak: 3, medium: 2, strong: 1 }[prev.get(t.id) ?? "medium"],
    passages: await retrieve(userId, `${t.name}. ${t.description}`, 4, ["notes", "textbook", "past_paper"]),
  })));
  const covered = plans.filter((p) => p.passages.length); // topics with no matching material are skipped
  if (!covered.length) throw new Error("No questions could be generated. Upload notes or past papers that cover your syllabus topics.");
 
  // One request for the whole quiz keeps us inside free-tier per-minute limits.
  const { object } = await generateObject({
    model: llm,
    schema: z.object({
      questions: z.array(z.object({
        topic: z.number(), question: z.string(), options: z.array(z.string()).length(4),
        correctIndex: z.number(), passage: z.number(), explanation: z.string(),
      })),
    }),
    prompt: `${GROUND}\nWrite multiple-choice questions for each topic below. Each question has 4 options, exactly one correct, and plausible distractors. "topic" is the TOPIC number, "passage" is the passage number inside that topic, and "explanation" says why the correct option is right.\n\n${covered.map((p, i) => `=== TOPIC ${i}: ${p.topic.name} (write exactly ${p.n} questions) ===\n${asContext(p.passages)}`).join("\n\n")}`,
  });
 
  const taken = new Map<number, number>();
  const valid = object.questions.filter((q) => {
    const p = covered[q.topic];
    if (!p || !p.passages[q.passage] || q.correctIndex < 0 || q.correctIndex > 3) return false;
    const c = taken.get(q.topic) ?? 0;
    if (c >= p.n) return false;
    taken.set(q.topic, c + 1);
    return true;
  });
  if (!valid.length) throw new Error("No usable questions were generated. Please try again.");
 
  const { data: attempt } = await db.from("attempts").insert({ user_id: userId }).select().single();
  const rows = valid.map((q) => {
    const p = covered[q.topic];
    const passage = p.passages[q.passage];
    return {
      attempt_id: attempt.id, topic_id: p.topic.id, question: q.question, options: q.options, correct_index: q.correctIndex,
      explanation: q.explanation, source_chunk_id: passage.id, citation: cite(passage),
    };
  });
  const { data } = await db.from("questions").insert(rows).select("id,topic_id,question,options,citation");
  return { attemptId: attempt.id as string, questions: data ?? [] };
}
 
/* ---------- Answer evaluation + gap analysis ---------- */
export async function gradeAttempt(userId: string, attemptId: string, answers: { questionId: string; selected: number }[]) {
  const { data: attempt } = await db.from("attempts").select("*").eq("id", attemptId).eq("user_id", userId).single();
  if (!attempt || attempt.status !== "open") throw new Error("Quiz not found or already submitted.");
  const { data: qs } = await db.from("questions")
    .select("*, topics(name), chunks:chunks!source_chunk_id(content)").eq("attempt_id", attemptId);
  if (!qs?.length) throw new Error("Quiz has no questions.");
  const picked = new Map(answers.map((a) => [a.questionId, a.selected]));
 
  // Marking is plain code: compare the chosen option with the stored correct index.
  const graded = qs.map((q) => {
    const selected = picked.get(q.id) ?? -1;
    return { q, selected, ok: selected === q.correct_index, feedback: (q.explanation ?? "") as string };
  });
 
  const by = new Map<string, { name: string; correct: number; total: number; missed: string[]; sources: Set<string> }>();
  for (const g of graded) {
   const s = by.get(g.q.topic_id) ?? { name: g.q.topics.name, correct: 0, total: 0, missed: [] as string[], sources: new Set<string>() };
    s.total++;
    if (g.ok) s.correct++; else { s.missed.push(g.q.question); s.sources.add(g.q.citation); }
    by.set(g.q.topic_id, s);
  }
  const stats = [...by.entries()].map(([id, s]) => ({ id, ...s, rating: rate(s.correct / s.total) }));
 
  // One LLM request explains every wrong answer and every topic rating. It cannot change the ratings.
  const wrong = graded.map((g, i) => ({ g, i })).filter((x) => !x.g.ok);
  const reasons = new Map<string, string>();
  try {
    const { object } = await generateObject({
      model: llm,
      schema: z.object({
        feedback: z.array(z.object({ n: z.number(), feedback: z.string() })),
        reasons: z.array(z.object({ topic: z.string(), reason: z.string() })),
      }),
      prompt: `${GROUND}\n\nPART A. For each wrong answer below, write two sentences explaining why the student's choice is wrong and why the correct option is right. Use the same number n.\n${wrong.map(({ g, i }) => `n=${i}\nPassage: ${g.q.chunks?.content ?? ""}\nQuestion: ${g.q.question}\nOptions: ${g.q.options.join(" | ")}\nStudent chose: ${g.selected >= 0 ? g.q.options[g.selected] : "(no answer)"}\nCorrect: ${g.q.options[g.q.correct_index]}`).join("\n\n") || "(none, every answer was correct)"}\n\nPART B. For each topic, write one plain sentence telling the student why it received its rating, naming the concept they seem to be missing. Do not change ratings.\n${stats.map((s) => `- ${s.name}: ${s.correct}/${s.total} correct, rated ${s.rating}. Missed: ${s.missed.join("; ") || "none"}`).join("\n")}`,
    });
    object.feedback.forEach((f) => { if (graded[f.n] && !graded[f.n].ok) graded[f.n].feedback = f.feedback; });
    object.reasons.forEach((r) => reasons.set(r.topic, r.reason));
  } catch { /* keep stored explanations and template reasons */ }
 
  await db.from("answers").insert(graded.map((g) => ({ question_id: g.q.id, selected_index: g.selected, is_correct: g.ok, feedback: g.feedback })));
  await db.from("topic_scores").insert(stats.map((s) => ({
    attempt_id: attemptId, user_id: userId, topic_id: s.id, correct: s.correct, total: s.total, rating: s.rating,
    reason: reasons.get(s.name) ?? `${s.correct} of ${s.total} questions correct.`, sources: [...s.sources],
  })));
  const total = graded.length, right = graded.filter((g) => g.ok).length;
  await db.from("attempts").update({ status: "graded", score: Math.round((right / total) * 100) }).eq("id", attemptId);
 
  const { data: last } = await db.from("plans").select("days,hours_per_day").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
  await makePlan(userId, attemptId, last?.[0]?.days ?? 14, Number(last?.[0]?.hours_per_day ?? 2)); // plan adapts after every attempt
 
  return {
    score: Math.round((right / total) * 100),
    results: graded.map((g) => ({ question: g.q.question, topic: g.q.topics.name, correct: g.ok, yourAnswer: g.selected >= 0 ? g.q.options[g.selected] : null,
      rightAnswer: g.q.options[g.q.correct_index], feedback: g.feedback, citation: g.q.citation })),
  };
}
 
/* ---------- Report + progress ---------- */
export async function getReport(userId: string) {
  const { data: attempts } = await db.from("attempts").select("id,score,created_at").eq("user_id", userId).eq("status", "graded").order("created_at");
  const { data } = await db.from("topic_scores").select("attempt_id,correct,total,rating,reason,sources,topics(name)").eq("user_id", userId);
  const scores = (data ?? []).map((s) => ({ ...s, topic: (s.topics as unknown as { name: string }).name }));
  return { attempts: attempts ?? [], scores };
}
 
/* ---------- Revision plan: allocation is arithmetic, wording is generated ---------- */
export async function makePlan(userId: string, attemptId: string, days: number, hoursPerDay: number) {
  const { data } = await db.from("topic_scores").select("*, topics(name)").eq("attempt_id", attemptId);
  const rows = (data ?? []).map((s) => ({ ...s, name: (s.topics as { name: string }).name as string }));
  if (!rows.length) throw new Error("Take a quiz first.");
 
  const weight = { weak: 3, medium: 1.5, strong: 0.5 } as const;
  const totalMin = days * hoursPerDay * 60;
  const sumW = rows.reduce((a, r) => a + weight[r.rating as Rating], 0);
  const focus = new Map<string, string>();
  try {
    const needy = rows.filter((r) => r.rating !== "strong");
    if (needy.length) {
      const { object } = await generateObject({
        model: llm, schema: z.object({ items: z.array(z.object({ topic: z.string(), focus: z.string() })) }),
        prompt: `Give each topic one concrete revision action (what to re-read, what to practise), based only on the diagnosis and the sections listed.\n${needy.map((r) => `- ${r.name}: ${r.reason} Sections: ${(r.sources as string[]).join("; ")}`).join("\n")}`,
      });
      object.items.forEach((i) => focus.set(i.topic, i.focus));
    }
  } catch { /* plan still works without generated focus text */ }
 
  const queue = rows
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .map((r) => ({ topic: r.name, rating: r.rating as Rating, left: Math.max(15, Math.round((totalMin * weight[r.rating as Rating]) / sumW / 5) * 5),
      focus: focus.get(r.name) ?? r.reason, sections: r.sources as string[] }));
 
  const items: { day: number; topic: string; rating: Rating; minutes: number; focus: string; sections: string[] }[] = [];
  for (let day = 1; day <= days && queue.length; day++) {
    let room = hoursPerDay * 60;
    while (room > 0 && queue.length) {
      const t = queue.shift()!;
      const m = Math.min(t.left, 45, room);
      items.push({ day, topic: t.topic, rating: t.rating, minutes: m, focus: t.focus, sections: t.sections });
      t.left -= m; room -= m;
      if (t.left > 0) queue.push(t); // interleave topics instead of marathon sessions
    }
  }
  const { data: plan } = await db.from("plans").insert({ user_id: userId, attempt_id: attemptId, days, hours_per_day: hoursPerDay, items }).select().single();
  return plan;
}
 
export async function latestPlan(userId: string) {
  const { data } = await db.from("plans").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}
 
/* ---------- Explain-this-topic (RAG answer; refuses when retrieval is empty) ---------- */
export async function ask(userId: string, question: string) {
  const passages = await retrieve(userId, question, 5);
  if (!passages.length) return { answer: "I couldn't find this in your uploaded material, so I won't guess. Try uploading notes that cover it.", sources: [] };
  const { text } = await generateText({
    model: llm,
    system: `${GROUND} Cite passages inline like [0], [1]. If they don't contain the answer, say so plainly.`,
    prompt: `${asContext(passages)}\n\nQuestion: ${question}`,
  });
  return { answer: text, sources: passages.map((p, i) => ({ n: i, title: cite(p), text: p.content })) };
}