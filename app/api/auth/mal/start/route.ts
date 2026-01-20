import crypto from "crypto";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET() {
  const clientId = process.env.MAL_CLIENT_ID!;
  const redirectUri = process.env.MAL_REDIRECT_URI!;

  if (!clientId) return new Response("Missing MAL_CLIENT_ID", { status: 500 });
  if (!redirectUri) return new Response("Missing MAL_REDIRECT_URI", { status: 500 });

  // PKCE (simple “plain” method works with MAL)
  const codeVerifier = base64url(crypto.randomBytes(64)); // 86 chars-ish
  const state = base64url(crypto.randomBytes(32));

  // Store verifier + state in secure, httpOnly cookies (temporary; later move to DB/session)
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `mal_code_verifier=${codeVerifier}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600`
  );
  headers.append(
    "Set-Cookie",
    `mal_oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600`
  );

  const authUrl = new URL("https://myanimelist.net/v1/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeVerifier); // PKCE plain
  authUrl.searchParams.set("code_challenge_method", "plain");

  return new Response(null, {
    status: 302,
    headers: (() => {
        headers.set("Location", authUrl.toString());
        return headers;
  })(),
});

}
