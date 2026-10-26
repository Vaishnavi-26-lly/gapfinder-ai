import { handle } from "@/lib/api";
import { getReport } from "@/lib/pipeline";
export const GET = () => handle((userId) => getReport(userId));
