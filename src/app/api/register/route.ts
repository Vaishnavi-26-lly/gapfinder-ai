import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { email, password, name } = await req.json();
  if (!email || !password || password.length < 8) return NextResponse.json({ error: "Use a valid email and a password of 8+ characters." }, { status: 400 });
  const { error } = await db.from("users").insert({ email: String(email).toLowerCase(), name, password_hash: await hash(password, 10) });
  if (error) return NextResponse.json({ error: "That email is already registered." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
