import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { latestPlan, makePlan } from "@/lib/pipeline";
export const maxDuration = 60;
export const GET = () => handle((userId) => latestPlan(userId));
export const POST = (req: Request) => handle(async (userId) => {
  const { days, hoursPerDay } = await req.json();
  const { data } = await db.from("attempts").select("id").eq("user_id", userId).eq("status", "graded").order("created_at", { ascending: false }).limit(1);
  if (!data?.[0]) throw new Error("Take a quiz first.");
  return makePlan(userId, data[0].id, Math.min(Math.max(+days || 14, 1), 60), Math.min(Math.max(+hoursPerDay || 2, 0.5), 12));
});
