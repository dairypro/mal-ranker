import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state)
    return new Response("Missing code/state", { status: 400 });

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("mal_oauth_state")?.value;
  const codeVerifier = cookieStore.get("mal_code_verifier")?.value;

  if (!expectedState || !codeVerifier || state !== expectedState) {
    return new Response("Invalid state", { status: 400 });
  }

  const tokenUrl = "https://myanimelist.net/v1/oauth2/token";
  const redirectUri = process.env.MAL_REDIRECT_URI!;
  const clientId = process.env.MAL_CLIENT_ID!;
  const clientSecret = process.env.MAL_CLIENT_SECRET;

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  if (clientSecret) body.set("client_secret", clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("code_verifier", codeVerifier);
  body.set("redirect_uri", redirectUri);

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`Token exchange failed: ${err}`, { status: 500 });
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };

  // Step 1 simple approach: put access token in an httpOnly cookie.
  // Step 2: store tokens in DB (recommended).
  cookieStore.set("mal_access_token", tokens.access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expires_in,
    secure: process.env.NODE_ENV === "production",
  });

  // cleanup temp cookies
  cookieStore.set("mal_oauth_state", "", { path: "/", maxAge: 0 });
  cookieStore.set("mal_code_verifier", "", { path: "/", maxAge: 0 });

  // Redirect to app home
  return Response.redirect(new URL("/", process.env.APP_URL!), 302);
}