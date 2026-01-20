import { cookies } from "next/headers";
import { prisma } from '../../../../../prisma';
import { hashToken, newSessionToken } from "../../../../../session";

type TokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) return new Response("Missing code/state", { status: 400 });

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("mal_oauth_state")?.value;
  const codeVerifier = cookieStore.get("mal_code_verifier")?.value;

  if (!expectedState || !codeVerifier || state !== expectedState) {
    return new Response("Invalid state", { status: 400 });
  }

  // Exchange code -> tokens
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

  const tokens = (await tokenRes.json()) as TokenResponse;

  // Fetch MAL identity
  const meRes = await fetch("https://api.myanimelist.net/v2/users/@me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!meRes.ok) {
    const err = await meRes.text();
    return new Response(`MAL /users/@me failed: ${err}`, { status: 502 });
  }

  const me = (await meRes.json()) as { id: number; name: string };
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Upsert user + account
  const user = await prisma.user.upsert({
    where: { malUserId: me.id },
    update: {
      malUsername: me.name,
      malAccount: {
        upsert: {
          create: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
            tokenType: tokens.token_type,
            scope: tokens.scope,
          },
          update: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
            tokenType: tokens.token_type,
            scope: tokens.scope,
          },
        },
      },
    },
    create: {
      malUserId: me.id,
      malUsername: me.name,
      malAccount: {
        create: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          tokenType: tokens.token_type,
          scope: tokens.scope,
        },
      },
    },
  });

  // Create a session
  const rawSessionToken = newSessionToken();
  const tokenHash = hashToken(rawSessionToken);
  const sessionExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: sessionExpiresAt,
    },
  });

  // Set session cookie (THIS is your app auth going forward)
  cookieStore.set("session_token", rawSessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Optional: remove the old token cookie from Step 1 so you don't rely on it
  cookieStore.set("mal_access_token", "", { path: "/", maxAge: 0 });

  // Cleanup temp cookies
  cookieStore.set("mal_oauth_state", "", { path: "/", maxAge: 0 });
  cookieStore.set("mal_code_verifier", "", { path: "/", maxAge: 0 });

  return Response.redirect(new URL("/", process.env.APP_URL!), 302);
}
