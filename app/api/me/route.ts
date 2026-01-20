import { getCurrentUser } from "../../../auth";
import { prisma } from "../../../prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });

  const account = await prisma.malAccount.findUnique({
    where: { userId: user.id },
    select: { expiresAt: true },
  });

  return Response.json({
    id: user.id,
    malUserId: user.malUserId,
    malUsername: user.malUsername,
    tokenExpiresAt: account?.expiresAt ?? null,
  });
}
