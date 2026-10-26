import { handle } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = () => handle(async (userId) => {
  const { data: documents } = await db.from("documents").select("id,title,kind").eq("user_id", userId).order("created_at");
  const { data: topics } = await db.from("topics").select("id,name,description").eq("user_id", userId).order("position");
  return { documents: documents ?? [], topics: topics ?? [] };
});
