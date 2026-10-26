import { handle } from "@/lib/api";
import { ask } from "@/lib/pipeline";
export const maxDuration = 60;
export const POST = (req: Request) => handle(async (userId) => ask(userId, String((await req.json()).question ?? "").slice(0, 500)));
