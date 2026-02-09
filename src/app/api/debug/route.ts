import { NextResponse } from "next/server";

/** Unbuffered write so Docker/local logs show up (stdout can be buffered in Node when not a TTY). */
function debugLog(msg: string) {
  const line = `[DEBUG] ${msg}\n`;
  process.stdout.write(line);
  process.stderr.write(line);
}

/**
 * GET /api/debug - Logs and returns a simple payload.
 * Use to verify that container/server logs are visible (e.g. curl http://localhost:3000/api/debug).
 */
export async function GET() {
  const ts = new Date().toISOString();
  debugLog(`GET /api/debug called at ${ts}`);
  return NextResponse.json({
    ok: true,
    message: "debug",
    timestamp: ts,
    nodeEnv: process.env.NODE_ENV ?? "undefined",
    authDebug: process.env.AUTH_DEBUG ?? "undefined",
  });
}
