"use client";
import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Rating = "weak" | "medium" | "strong";
type Doc = { id: string; title: string; kind: string };
type Topic = { id: string; name: string; description: string };
type Score = { attempt_id: string; topic: string; correct: number; total: number; rating: Rating; reason: string; sources: string[] };
type Attempt = { id: string; score: number; created_at: string };
type Question = { id: string; question: string; options: string[]; citation: string };
type Result = { question: string; topic: string; correct: boolean; yourAnswer: string | null; rightAnswer: string; feedback: string; citation: string };
type PlanItem = { day: number; topic: string; rating: Rating; minutes: number; focus: string; sections: string[] };

const TABS = ["Materials", "Quiz", "Gap report", "Plan", "Ask"] as const;
const tone: Record<Rating, string> = { weak: "bg-weak", medium: "bg-medium", strong: "bg-strong" };

async function api<T>(url: string, body?: unknown, form?: FormData): Promise<T> {
  const post = body !== undefined || form !== undefined;
  const r = await fetch(url, { method: post ? "POST" : "GET", headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
  return j as T;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(""); try { await fn(); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  return { busy, err, run };
}

const Err = ({ msg }: { msg: string }) => (msg ? <p role="alert" className="mt-3 text-sm text-weak">{msg}</p> : null);

function HeatStrip({ scores }: { scores: Score[] }) {
  return (
    <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label="Topic ratings">
      {scores.map((s) => <div key={s.topic} title={`${s.topic}: ${s.rating}`} className={`${tone[s.rating]} flex-1 border-r border-paper last:border-0`} />)}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Materials");
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">GapFinder AI</h1>
        <button className="btn-ghost" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button>
      </header>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-ink/10" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-current={tab === t} className={`whitespace-nowrap px-4 py-2 text-sm font-semibold ${tab === t ? "border-b-2 border-accent text-accent" : "text-ink/60"}`}>{t}</button>
        ))}
      </nav>
      {tab === "Materials" && <Materials goQuiz={() => setTab("Quiz")} />}
      {tab === "Quiz" && <Quiz goReport={() => setTab("Gap report")} />}
      {tab === "Gap report" && <Report />}
      {tab === "Plan" && <Plan />}
      {tab === "Ask" && <Ask />}
    </div>
  );
}

function Materials({ goQuiz }: { goQuiz: () => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [kind, setKind] = useState("notes");
  const { busy, err, run } = useAction();
  const load = useCallback(() => api<{ documents: Doc[]; topics: Topic[] }>("/api/materials").then((d) => { setDocs(d.documents); setTopics(d.topics); }), []);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl bg-white p-5">
        <h2 className="text-lg font-semibold">Your material</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {docs.map((d) => <li key={d.id}><span className="text-ink/50">{d.kind.replace("_", " ")}:</span> {d.title}</li>)}
          {!docs.length && <li className="text-ink/60">Nothing yet. Start with your syllabus.</li>}
        </ul>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const el = e.currentTarget; run(async () => { await api("/api/upload", undefined, form); el.reset(); await load(); }); }}>
          <select name="kind" className="field" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Material type">
            <option value="syllabus">Syllabus</option><option value="notes">Notes</option><option value="textbook">Textbook chapter</option><option value="past_paper">Past paper</option>
          </select>
          <input name="file" type="file" accept=".pdf,.txt,.md" className="text-sm" required />
          <button className="btn" disabled={busy}>{busy ? "Working…" : "Upload"}</button>
        </form>
        <Err msg={err} />
      </div>
      <div className="rounded-xl bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Topic map</h2>
          <button className="btn-ghost" disabled={busy || !docs.some((d) => d.kind === "syllabus")} onClick={() => run(async () => { await api("/api/topics", {}); await load(); })}>{topics.length ? "Rebuild" : "Build from syllabus"}</button>
        </div>
        <ol className="mt-3 space-y-2 text-sm">
          {topics.map((t) => <li key={t.id}><b>{t.name}</b><span className="block text-ink/60">{t.description}</span></li>)}
          {!topics.length && <li className="text-ink/60">Upload a syllabus, then build the topic map.</li>}
        </ol>
        {topics.length > 0 && <button className="btn mt-4" onClick={goQuiz}>Take the diagnostic quiz</button>}
      </div>
    </section>
  );
}

function Quiz({ goReport }: { goReport: () => void }) {
  const [quiz, setQuiz] = useState<{ attemptId: string; questions: Question[] } | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [out, setOut] = useState<{ score: number; results: Result[] } | null>(null);
  const { busy, err, run } = useAction();

  if (out) return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Score: {out.score}%</h2>
      {out.results.map((r, i) => (
        <article key={i} className={`rounded-xl border-l-4 bg-white p-4 text-sm ${r.correct ? "border-strong" : "border-weak"}`}>
          <p className="font-semibold">{r.question}</p>
          {!r.correct && <p className="mt-1">You chose: {r.yourAnswer ?? "no answer"}. Correct: {r.rightAnswer}</p>}
          <p className="mt-1 text-ink/80">{r.feedback}</p>
          <p className="mt-1 text-xs text-ink/50">Source: {r.citation}</p>
        </article>
      ))}
      <button className="btn" onClick={goReport}>See your gap report</button>
    </section>
  );

  if (!quiz) return (
    <section className="rounded-xl bg-white p-5">
      <h2 className="text-lg font-semibold">Diagnostic quiz</h2>
      <p className="mt-1 text-sm text-ink/70">Every question comes from your own material and cites where. Later attempts ask more about your weak topics.</p>
      <button className="btn mt-4" disabled={busy} onClick={() => run(async () => { setQuiz(await api("/api/quiz", {})); setPicked({}); })}>{busy ? "Writing questions…" : "Start quiz"}</button>
      <Err msg={err} />
    </section>
  );

  return (
    <section className="space-y-4">
      {quiz.questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl bg-white p-4 text-sm">
          <legend className="font-semibold">{i + 1}. {q.question}</legend>
          {q.options.map((o, k) => (
            <label key={k} className="mt-2 flex cursor-pointer items-start gap-2">
              <input type="radio" name={q.id} checked={picked[q.id] === k} onChange={() => setPicked({ ...picked, [q.id]: k })} className="mt-1" /> {o}
            </label>
          ))}
        </fieldset>
      ))}
      <button className="btn" disabled={busy} onClick={() => run(async () => setOut(await api("/api/quiz/submit", { attemptId: quiz.attemptId, answers: quiz.questions.map((q) => ({ questionId: q.id, selected: picked[q.id] ?? -1 })) })))}>
        {busy ? "Marking…" : `Submit (${Object.keys(picked).length}/${quiz.questions.length} answered)`}
      </button>
      <Err msg={err} />
    </section>
  );
}

function Report() {
  const [d, setD] = useState<{ attempts: Attempt[]; scores: Score[] } | null>(null);
  const { err, run } = useAction();
  useEffect(() => { run(async () => setD(await api("/api/report"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Err msg={err} />;
  if (!d.attempts.length) return <p className="text-ink/70">No results yet. Take the diagnostic quiz first.</p>;
  const latest = d.attempts[d.attempts.length - 1];
  const now = d.scores.filter((s) => s.attempt_id === latest.id).sort((a, b) => a.correct / a.total - b.correct / b.total);
  return (
    <section className="space-y-6">
      <div className="rounded-xl bg-white p-5">
        <h2 className="text-lg font-semibold">Where you stand</h2>
        <div className="mt-3"><HeatStrip scores={now} /></div>
        <ul className="mt-4 divide-y text-sm">
          {now.map((s) => (
            <li key={s.topic} className="py-3">
              <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${tone[s.rating]}`} /><b>{s.topic}</b><span className="text-ink/50">{s.rating} · {s.correct}/{s.total}</span></div>
              <p className="mt-1 text-ink/80">{s.reason}</p>
              {s.sources.length > 0 && <p className="mt-1 text-xs text-ink/50">Revisit: {s.sources.join("; ")}</p>}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-white p-5">
        <h2 className="text-lg font-semibold">Progress across attempts</h2>
        <svg viewBox="0 0 300 80" className="mt-3 w-full max-w-md" role="img" aria-label="Score by attempt">
          <polyline fill="none" stroke="#3B4CCA" strokeWidth="2" points={d.attempts.map((a, i) => `${10 + (i * 280) / Math.max(d.attempts.length - 1, 1)},${70 - (a.score / 100) * 60}`).join(" ")} />
          {d.attempts.map((a, i) => <circle key={a.id} cx={10 + (i * 280) / Math.max(d.attempts.length - 1, 1)} cy={70 - (a.score / 100) * 60} r="3" fill="#3B4CCA"><title>{a.score}%</title></circle>)}
        </svg>
        <div className="mt-3 overflow-x-auto">
          <table className="text-sm"><thead><tr><th className="pr-4 text-left">Topic</th>{d.attempts.map((_, i) => <th key={i} className="px-2">#{i + 1}</th>)}</tr></thead>
            <tbody>{[...new Set(d.scores.map((s) => s.topic))].map((t) => (
              <tr key={t}><td className="pr-4">{t}</td>{d.attempts.map((a) => { const s = d.scores.find((x) => x.topic === t && x.attempt_id === a.id); return <td key={a.id} className="px-2 text-center">{s ? <span className={`inline-block rounded px-2 text-white ${tone[s.rating]}`}>{Math.round((s.correct / s.total) * 100)}%</span> : "–"}</td>; })}</tr>
            ))}</tbody></table>
        </div>
      </div>
    </section>
  );
}

function Plan() {
  const [plan, setPlan] = useState<{ items: PlanItem[]; days: number; hours_per_day: number } | null>(null);
  const [days, setDays] = useState(14);
  const [hours, setHours] = useState(2);
  const { busy, err, run } = useAction();
  useEffect(() => { run(async () => { const p = await api<typeof plan>("/api/plan"); setPlan(p); if (p) { setDays(p.days); setHours(Number(p.hours_per_day)); } }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = (plan?.items ?? []).reduce<Record<number, PlanItem[]>>((m, i) => ((m[i.day] ??= []).push(i), m), {});
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 text-sm">
        <label>Days until exam<input type="number" min={1} max={60} className="field ml-2 w-20" value={days} onChange={(e) => setDays(+e.target.value)} /></label>
        <label>Hours per day<input type="number" min={0.5} max={12} step={0.5} className="field ml-2 w-20" value={hours} onChange={(e) => setHours(+e.target.value)} /></label>
        <button className="btn" disabled={busy} onClick={() => run(async () => setPlan(await api("/api/plan", { days, hoursPerDay: hours })))}>{busy ? "Planning…" : "Rebuild plan"}</button>
      </div>
      <Err msg={err} />
      {!plan && !err && <p className="text-ink/70">Your plan appears after your first quiz, and updates after every attempt.</p>}
      {Object.entries(byDay).map(([day, items]) => (
        <div key={day} className="rounded-xl bg-white p-4">
          <h3 className="font-semibold">Day {day}</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {items.map((i, k) => (
              <li key={k} className="flex gap-3"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${tone[i.rating]}`} />
                <span><b>{i.topic}</b> · {i.minutes} min<span className="block text-ink/70">{i.focus}</span></span></li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Ask() {
  const [q, setQ] = useState("");
  const [a, setA] = useState<{ answer: string; sources: { n: number; title: string; text: string }[] } | null>(null);
  const { busy, err, run } = useAction();
  return (
    <section className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => setA(await api("/api/ask", { question: q }))); }}>
        <input className="field flex-1" placeholder="Explain a topic from your material…" value={q} onChange={(e) => setQ(e.target.value)} required />
        <button className="btn" disabled={busy}>{busy ? "Searching…" : "Ask"}</button>
      </form>
      <Err msg={err} />
      {a && (
        <div className="rounded-xl bg-white p-5 text-sm">
          <p className="whitespace-pre-wrap">{a.answer}</p>
          {a.sources.map((s) => <details key={s.n} className="mt-3"><summary className="cursor-pointer text-xs text-ink/60">[{s.n}] {s.title}</summary><p className="mt-1 text-xs text-ink/70">{s.text}</p></details>)}
        </div>
      )}
    </section>
  );
}
