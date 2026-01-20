import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("mal_access_token")?.value;
  if (!accessToken) return new Response("Not logged in", { status: 401 });

  const res = await fetch("https://api.myanimelist.net/v2/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return new Response("MAL request failed", { status: 502 });
  const me = await res.json();
  return Response.json(me);
}
