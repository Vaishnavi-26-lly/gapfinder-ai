import { handle } from "@/lib/api";
import { createQuiz } from "@/lib/pipeline";
export const maxDuration = 60;
export const POST = () => handle((userId) => createQuiz(userId));
