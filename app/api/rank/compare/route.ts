import { getCurrentUser } from "@/auth";
import { prisma } from "@/prisma";
import { eloUpdate, requiredComparisons } from "@/ranking";
import { UserAnimeStatus } from "@/prisma/generated/enums";

const ELIGIBLE_STATUSES: UserAnimeStatus[] = [
  UserAnimeStatus.WATCHING,
  UserAnimeStatus.COMPLETED,
];

type Body = {
  winnerAnimeId: string;
  loserAnimeId: string;
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });

  const body = (await req.json()) as Body;
  const { winnerAnimeId, loserAnimeId } = body;

  if (!winnerAnimeId || !loserAnimeId || winnerAnimeId === loserAnimeId) {
    return new Response("Invalid payload", { status: 400 });
  }

  // Validate both anime are eligible for this user (not removed)
  const eligibleWhere = {
    userId: user.id,
    removedFromMAL: false,
    status: { in: ELIGIBLE_STATUSES },
    animeId: { in: [winnerAnimeId, loserAnimeId] },
  };

  const rows = await prisma.userAnime.findMany({ where: eligibleWhere });
  if (rows.length !== 2) return new Response("Anime not eligible", { status: 400 });

  // compute dynamic threshold based on current eligible count
  const eligibleCount = await prisma.userAnime.count({
    where: {
      userId: user.id,
      removedFromMAL: false,
      status: { in: ELIGIBLE_STATUSES },
    },
  });
  const threshold = requiredComparisons(eligibleCount);

  const result = await prisma.$transaction(async (tx) => {
    // Record the comparison event
    await tx.comparison.create({
      data: {
        userId: user.id,
        winnerAnimeId,
        loserAnimeId,
      },
    });

    // Ensure ratings exist (upsert)
    const [winnerRatingRow, loserRatingRow] = await Promise.all([
      tx.rating.upsert({
        where: { userId_animeId: { userId: user.id, animeId: winnerAnimeId } },
        create: { userId: user.id, animeId: winnerAnimeId, value: 1500 },
        update: {},
        select: { value: true },
      }),
      tx.rating.upsert({
        where: { userId_animeId: { userId: user.id, animeId: loserAnimeId } },
        create: { userId: user.id, animeId: loserAnimeId, value: 1500 },
        update: {},
        select: { value: true },
      }),
    ]);

    const { newWinner, newLoser } = eloUpdate(winnerRatingRow.value, loserRatingRow.value, 32);

    // Update Elo values
    await Promise.all([
      tx.rating.update({
        where: { userId_animeId: { userId: user.id, animeId: winnerAnimeId } },
        data: { value: newWinner },
      }),
      tx.rating.update({
        where: { userId_animeId: { userId: user.id, animeId: loserAnimeId } },
        data: { value: newLoser },
      }),
    ]);

    // Increment comparisonsCount for both
    const [wUA, lUA] = await Promise.all([
      tx.userAnime.update({
        where: { userId_animeId: { userId: user.id, animeId: winnerAnimeId } },
        data: { comparisonsCount: { increment: 1 } },
        select: { comparisonsCount: true },
      }),
      tx.userAnime.update({
        where: { userId_animeId: { userId: user.id, animeId: loserAnimeId } },
        data: { comparisonsCount: { increment: 1 } },
        select: { comparisonsCount: true },
      }),
    ]);

    // Flip needsRanking=false once enough comparisons reached
    await Promise.all([
      tx.userAnime.update({
        where: { userId_animeId: { userId: user.id, animeId: winnerAnimeId } },
        data: { needsRanking: wUA.comparisonsCount < threshold },
      }),
      tx.userAnime.update({
        where: { userId_animeId: { userId: user.id, animeId: loserAnimeId } },
        data: { needsRanking: lUA.comparisonsCount < threshold },
      }),
    ]);

    const needsRankingCount = await tx.userAnime.count({
      where: {
        userId: user.id,
        removedFromMAL: false,
        status: { in: ELIGIBLE_STATUSES },
        needsRanking: true,
      },
    });

    return { newWinner, newLoser, threshold, needsRankingCount };
  });

  return Response.json({ ok: true, ...result });
}
