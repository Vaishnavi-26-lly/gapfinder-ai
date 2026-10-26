import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "./db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(c) {
        if (!c?.email || !c.password) return null;
        const { data: u } = await db.from("users").select("*").eq("email", c.email.toLowerCase()).maybeSingle();
        if (!u || !(await compare(c.password, u.password_hash))) return null;
        return { id: u.id, email: u.email, name: u.name };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => { if (user) token.uid = user.id; return token; },
    session: ({ session, token }) => { if (session.user) session.user.id = token.uid as string; return session; },
  },
};
