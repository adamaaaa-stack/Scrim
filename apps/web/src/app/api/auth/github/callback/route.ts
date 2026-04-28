import { NextResponse, type NextRequest } from "next/server";
import { ghClient, ghExchangeCodeForToken, saveGithubIntegration } from "@/lib/github";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const stateB64 = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `GitHub returned: ${error}` }, { status: 400 });
  }
  if (!code || !stateB64) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  let state: { nonce: string; projectId: string };
  try {
    state = JSON.parse(Buffer.from(stateB64, "base64url").toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const cookieNonce = request.cookies.get("gh_oauth_nonce")?.value;
  if (!cookieNonce || cookieNonce !== state.nonce) {
    return NextResponse.json({ error: "State / nonce mismatch (CSRF check)" }, { status: 400 });
  }

  let token: string;
  try {
    token = await ghExchangeCodeForToken(code);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // Identify user; we'll save token + user, repo selection happens next.
  const gh = ghClient(token);
  const { data: user } = await gh.users.getAuthenticated();

  await saveGithubIntegration(state.projectId, {
    token,
    user: {
      login: user.login,
      name: user.name ?? null,
      avatar_url: user.avatar_url ?? null,
    },
    installed_at: new Date().toISOString(),
  });

  const res = NextResponse.redirect(
    new URL(`/projects/${state.projectId}/integrations/github`, request.url),
  );
  res.cookies.delete("gh_oauth_nonce");
  return res;
}
