"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ email: "demo@gapfinder.app", password: "Demo@1234", name: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    if (mode === "up") {
      const r = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      if (!r.ok) { setErr((await r.json()).error); setBusy(false); return; }
    }
    const res = await signIn("credentials", { email: f.email, password: f.password, redirect: false });
    if (res?.error) { setErr("Wrong email or password."); setBusy(false); } else window.location.href = "/";
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-4xl items-center gap-10 p-6 md:grid-cols-2">
      <div>
        <h1 className="text-4xl font-bold leading-tight">You can't ask about a gap you don't know you have.</h1>
        <p className="mt-4 max-w-md text-ink/70">Upload your syllabus and notes. GapFinder quizzes you from your own material and tells you which topics to revise first.</p>
        <div className="mt-6 flex h-3 max-w-xs overflow-hidden rounded-full" aria-hidden>
          <div className="w-1/4 bg-weak" /><div className="w-1/5 bg-medium" /><div className="flex-1 bg-strong" />
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{mode === "in" ? "Sign in" : "Create account"}</h2>
        {mode === "up" && <input className="field w-full" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        <input className="field w-full" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <input className="field w-full" type="password" placeholder="Password (8+ characters)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        {err && <p role="alert" className="text-sm text-weak">{err}</p>}
        <button className="btn w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
        <button type="button" className="w-full text-sm text-accent underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
        <p className="border-t pt-3 text-xs text-ink/60">Judges: demo@gapfinder.app / Demo@1234 (sample Operating Systems material preloaded).</p>
      </form>
    </main>
  );
}
