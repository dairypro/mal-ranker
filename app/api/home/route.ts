import { getCurrentUser } from "../../../auth";
import { prisma } from "../../../prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ loggedIn: false });

  const [eligibleCount, needsRankingCount, lastMalSyncAt] = await Promise.all([
    prisma.userAnime.count({
      where: {
        userId: user.id,
        removedFromMAL: false,
        status: { in: ["WATCHING", "COMPLETED"] },
      },
    }),
    prisma.userAnime.count({
      where: {
        userId: user.id,
        removedFromMAL: false,
        status: { in: ["WATCHING", "COMPLETED"] },
        needsRanking: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { lastMalSyncAt: true, malUsername: true },
    }),
  ]);

  return Response.json({
    loggedIn: true,
    malUsername: lastMalSyncAt?.malUsername ?? user.malUsername,
    eligibleCount,
    needsRankingCount,
    lastMalSyncAt: lastMalSyncAt?.lastMalSyncAt ?? null,
  });
}
