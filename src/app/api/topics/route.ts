import { handle } from "@/lib/api";
import { buildTopicMap } from "@/lib/pipeline";
export const maxDuration = 60;
export const POST = () => handle((userId) => buildTopicMap(userId));
