import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { hashToken } from "./session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("session_token")?.value;
  if (!raw) return null;

  const tokenHash = hashToken(raw);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) return null;

  return session.user;
}
