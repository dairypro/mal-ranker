import { getCurrentUser } from "@/auth";
import { prisma } from "@/prisma";
import { UserAnimeStatus } from "@/prisma/generated/enums";

const ELIGIBLE_STATUSES: UserAnimeStatus[] = [
  UserAnimeStatus.WATCHING,
  UserAnimeStatus.COMPLETED,
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });

  const userAnime = await prisma.userAnime.findMany({
    where: {
      userId: user.id,
      removedFromMAL: false,
      status: { in: ELIGIBLE_STATUSES },
    },
    select: {
      animeId: true,
      anime: {
        select: {
          title: true,
          imageUrl: true,
          malAnimeId: true,
        },
      },
    },
  });

  const animeIds = userAnime.map((row) => row.animeId);
  const ratings = animeIds.length
    ? await prisma.rating.findMany({
        where: {
          userId: user.id,
          animeId: { in: animeIds },
        },
        select: {
          animeId: true,
          value: true,
        },
      })
    : [];

  const ratingMap = new Map<string, number>();
  for (const row of ratings) {
    ratingMap.set(row.animeId, row.value);
  }

  const items = userAnime
    .map((row) => ({
      animeId: row.animeId,
      title: row.anime.title,
      imageUrl: row.anime.imageUrl,
      malAnimeId: row.anime.malAnimeId,
      rating: ratingMap.get(row.animeId) ?? 1500,
    }))
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.title.localeCompare(b.title);
    })
    .map((row, idx) => ({
      rank: idx + 1,
      ...row,
    }));

  return Response.json({ items });
}
