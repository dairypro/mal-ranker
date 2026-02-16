import { cookies } from "next/headers";
import { prisma } from "@/prisma";
import { hashToken } from "@/session";

export async function POST() {
  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get("session_token")?.value;

  if (rawSessionToken) {
    const tokenHash = hashToken(rawSessionToken);
    await prisma.session.deleteMany({ where: { tokenHash } });
  }

  cookieStore.set("session_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });

  return Response.json({ ok: true });
}
