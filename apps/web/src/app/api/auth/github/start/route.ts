import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { ghAuthorizeUrl } from "@/lib/github";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  // CSRF state — random nonce we'll verify on callback. Encode projectId so we
  // know which project to attach the integration to after the user comes back.
  const nonce = randomBytes(16).toString("hex");
  const stateValue = JSON.stringify({ nonce, projectId });
  const stateB64 = Buffer.from(stateValue).toString("base64url");

  const url = ghAuthorizeUrl(stateB64);
  const res = NextResponse.redirect(url);
  res.cookies.set("gh_oauth_nonce", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
