import { handle } from "@/lib/api";
import { gradeAttempt } from "@/lib/pipeline";
export const maxDuration = 60;
export const POST = (req: Request) => handle(async (userId) => {
  const { attemptId, answers } = await req.json();
  return gradeAttempt(userId, attemptId, answers);
});
