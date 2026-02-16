import { getCurrentUser } from "../../../../auth";
import { prisma } from "../../../../prisma";
import { UserAnimeStatus } from "@/prisma/generated/enums";

function pickRandom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });

  const eligibleWhere = {
    userId: user.id,
    removedFromMAL: false,
    status: { in: [UserAnimeStatus.WATCHING, UserAnimeStatus.COMPLETED] },
  };

  const aCandidates = await prisma.userAnime.findMany({
    where: { ...eligibleWhere, needsRanking: true },
    orderBy: [{ comparisonsCount: "asc" }, { lastSeenAt: "desc" }],
    take: 30,
    include: {
      anime: { select: { id: true, title: true, imageUrl: true, malAnimeId: true } },
    },
  });

  if (aCandidates.length === 0) {
    return new Response(null, { status: 204 });
  }

  const A = pickRandom(aCandidates);

  const aRatingRow = await prisma.rating.findUnique({
    where: { userId_animeId: { userId: user.id, animeId: A.animeId } },
    select: { value: true },
  });
  const aRating = aRatingRow?.value ?? 1500;

  const bSample = await prisma.userAnime.findMany({
    where: { ...eligibleWhere, animeId: { not: A.animeId } },
    take: 40,
    include: {
      anime: { select: { id: true, title: true, imageUrl: true, malAnimeId: true } },
    },
  });

  if (bSample.length === 0) {
    return new Response("Not enough anime to compare", { status: 400 });
  }

  const bIds = bSample.map((x) => x.animeId);
  const bRatings = await prisma.rating.findMany({
    where: { userId: user.id, animeId: { in: bIds } },
    select: { animeId: true, value: true },
  });

  const ratingMap = new Map<string, number>();
  for (const r of bRatings) ratingMap.set(r.animeId, r.value);

  let best = bSample[0];
  let bestDiff = Math.abs((ratingMap.get(best.animeId) ?? 1500) - aRating);

  for (const cand of bSample) {
    const diff = Math.abs((ratingMap.get(cand.animeId) ?? 1500) - aRating);
    if (diff < bestDiff) {
      best = cand;
      bestDiff = diff;
    }
  }

  const B = best;

  return Response.json({
    A: {
      animeId: A.animeId,
      title: A.anime.title,
      imageUrl: A.anime.imageUrl,
      malAnimeId: A.anime.malAnimeId,
    },
    B: {
      animeId: B.animeId,
      title: B.anime.title,
      imageUrl: B.anime.imageUrl,
      malAnimeId: B.anime.malAnimeId,
    },
  });
}
