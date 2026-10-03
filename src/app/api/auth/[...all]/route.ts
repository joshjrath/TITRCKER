import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth/auth";

// Better Auth owns every /api/auth/* endpoint (sign-in, sign-out, session, two-factor verification).
// The instance is resolved per request so `next build` never needs runtime secrets.
export const { GET, POST } = toNextJsHandler((request: Request) => getAuth().handler(request));
