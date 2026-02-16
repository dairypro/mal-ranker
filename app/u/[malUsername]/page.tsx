import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { UserAnimeStatus } from "@/prisma/generated/enums";
import { prisma } from "@/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

type PageProps = {
  params: Promise<{ malUsername: string }>;
};

type RankedAnime = {
  rank: number;
  animeId: string;
  title: string;
  imageUrl: string | null;
  malAnimeId: number;
  rating: number;
};

const PUBLIC_LIST_RATE_LIMIT = {
  max: 60,
  windowMs: 60_000,
};

function scoreToTen(rank: number, total: number) {
  if (total <= 1) return "10.0";
  const normalized = (rank - 1) / (total - 1);
  const score = 10 - normalized * 9;
  return score.toFixed(1);
}

async function getPublicRankedList(malUsername: string): Promise<{ username: string; items: RankedAnime[] } | null> {
  const user = await prisma.user.findFirst({
    where: { malUsername },
    select: { id: true, malUsername: true },
  });

  if (!user) return null;

  const userAnime = await prisma.userAnime.findMany({
    where: {
      userId: user.id,
      removedFromMAL: false,
      status: { in: [UserAnimeStatus.WATCHING, UserAnimeStatus.COMPLETED] },
      comparisonsCount: { gt: 0 },
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
        where: { userId: user.id, animeId: { in: animeIds } },
        select: { animeId: true, value: true },
      })
    : [];

  const ratingMap = new Map<string, number>();
  for (const row of ratings) ratingMap.set(row.animeId, row.value);

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
    .map((row, idx) => ({ rank: idx + 1, ...row }));

  return { username: user.malUsername, items };
}

function getClientIp(headerStore: Headers) {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headerStore.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

export default async function PublicListPage({ params }: PageProps) {
  const headerStore = await headers();
  const clientIp = getClientIp(headerStore);
  const rateLimit = checkRateLimit(`public-list:${clientIp}`, PUBLIC_LIST_RATE_LIMIT);

  if (!rateLimit.allowed) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-2xl px-4 py-20">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
            <h1 className="text-xl font-semibold">Rate limit reached</h1>
            <p className="mt-2 text-sm text-zinc-300">
              Too many requests from this IP. Try again in about {rateLimit.retryAfterSeconds}
              seconds.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { malUsername } = await params;
  const data = await getPublicRankedList(decodeURIComponent(malUsername));

  if (!data) notFound();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{data.username}&apos;s MAL Rankings</h1>
        <p className="mt-1 text-sm text-zinc-400">Public read-only ranking list.</p>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          {data.items.length === 0 && (
            <div className="text-sm text-zinc-400">No ranked items yet.</div>
          )}

          {data.items.length > 0 && (
            <div className="space-y-2">
              {data.items.map((item) => (
                <div
                  key={item.animeId}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-2"
                >
                  <div className="w-9 text-center text-sm font-semibold text-zinc-300">#{item.rank}</div>

                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        width={40}
                        height={56}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-zinc-400">MAL #{item.malAnimeId}</div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-zinc-400">Score</div>
                    <div className="text-sm font-semibold">
                      {scoreToTen(item.rank, data.items.length)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
