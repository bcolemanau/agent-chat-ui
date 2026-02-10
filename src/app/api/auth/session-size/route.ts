import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";

/** Common browser cookie size limit (bytes). NextAuth may chunk if larger. */
const TYPICAL_COOKIE_LIMIT_BYTES = 4096;

/**
 * GET /api/auth/session-size
 * Returns size metrics for the current session (JWT / cookie).
 * Use to debug JWT_SESSION_ERROR or decryption issues that can be caused by oversized cookies.
 */
export async function GET() {
  const session = await getSessionSafe();
  if (!session?.user) {
    return NextResponse.json({
      signedIn: false,
      message: "No session (sign in to see session size)",
    });
  }

  const idToken = session.user.idToken ?? "";
  const idTokenChars = idToken.length;
  const idTokenBytes = new Blob([idToken]).size;

  // NextAuth stores token (session fields + idToken) in an encrypted cookie; encrypted size is larger. This is a lower bound.
  const sessionJson = JSON.stringify(session);
  const approxPayloadBytes = new Blob([sessionJson]).size;

  const overLimit = approxPayloadBytes > TYPICAL_COOKIE_LIMIT_BYTES;

  return NextResponse.json({
    signedIn: true,
    sizes: {
      idTokenChars,
      idTokenBytes,
      sessionJsonChars: sessionJson.length,
      approxPayloadBytes,
      typicalCookieLimitBytes: TYPICAL_COOKIE_LIMIT_BYTES,
      overTypicalLimit: overLimit,
    },
    note: overLimit
      ? "Session payload may exceed single-cookie limit; consider shortening claims or using database sessions."
      : "Within typical 4KB cookie limit.",
  });
}
