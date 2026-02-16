import { UserAnimeStatus } from "@/prisma/generated/enums";
import { prisma } from "./prisma";

type MalTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
};

type MalAnimeListItem = {
  node: {
    id: number;
    title: string;
    main_picture?: { medium?: string; large?: string };
  };
  list_status?: {
    status?: string;
  };
};

function mapStatusToEnum(status: "watching" | "completed"): UserAnimeStatus {
  return status === "watching" ? UserAnimeStatus.WATCHING : UserAnimeStatus.COMPLETED;
}

async function refreshAccessToken(userId: string) {
  const account = await prisma.malAccount.findUnique({ where: { userId } });
  if (!account) throw new Error("Missing MalAccount");

  const tokenUrl = "https://myanimelist.net/v1/oauth2/token";
  const clientId = process.env.MAL_CLIENT_ID!;
  const clientSecret = process.env.MAL_CLIENT_SECRET;

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  if (clientSecret) body.set("client_secret", clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", account.refreshToken);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MAL refresh failed: ${txt}`);
  }

  const tokens = (await res.json()) as MalTokenResponse;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.malAccount.update({
    where: { userId },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? account.refreshToken,
      expiresAt,
      tokenType: tokens.token_type,
      scope: tokens.scope,
    },
  });

  return tokens.access_token;
}

export async function getValidAccessToken(userId: string) {
  const account = await prisma.malAccount.findUnique({ where: { userId } });
  if (!account) throw new Error("Missing MalAccount");

  // small buffer so we refresh a bit before expiry
  const bufferMs = 60_000;
  if (account.expiresAt.getTime() - Date.now() > bufferMs) {
    return account.accessToken;
  }

  return refreshAccessToken(userId);
}

async function fetchAllAnimeListByStatus(accessToken: string, status: "watching" | "completed") {
  const items: MalAnimeListItem[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = new URL("https://api.myanimelist.net/v2/users/@me/animelist");
    url.searchParams.set("status", status);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("fields", "list_status,main_picture");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`MAL animelist fetch failed (${status}): ${txt}`);
    }

    const data = (await res.json()) as { data?: MalAnimeListItem[]; paging?: { next?: string } };
    const batch = data.data ?? [];
    items.push(...batch);

    if (!data.paging?.next) break;
    offset += limit;
  }

  return items;
}

export async function syncMalList(userId: string) {
  const accessToken = await getValidAccessToken(userId);

  const [watching, completed] = await Promise.all([
    fetchAllAnimeListByStatus(accessToken, "watching"),
    fetchAllAnimeListByStatus(accessToken, "completed"),
  ]);

  const now = new Date();

  // Normalize entries into a flat array
  const entries = [
    ...watching.map((x) => ({ item: x, status: "watching" as const })),
    ...completed.map((x) => ({ item: x, status: "completed" as const })),
  ];

  // This set is used to find what got removed
  const currentMalIds = new Set<number>();
  let addedCount = 0;

  // Upsert Anime + UserAnime
  for (const { item, status } of entries) {
    const malAnimeId = item.node.id;
    currentMalIds.add(malAnimeId);

    const imageUrl = item.node.main_picture?.large ?? item.node.main_picture?.medium ?? null;

    const anime = await prisma.anime.upsert({
      where: { malAnimeId },
      update: {
        title: item.node.title,
        imageUrl,
      },
      create: {
        malAnimeId,
        title: item.node.title,
        imageUrl,
      },
      select: { id: true },
    });

    const existing = await prisma.userAnime.findUnique({
      where: { userId_animeId: { userId, animeId: anime.id } },
      select: { id: true, removedFromMAL: true, needsRanking: true },
    });

    // New entries and re-added entries should re-enter the ranking queue.
    if (!existing) {
      addedCount += 1;
      await prisma.userAnime.create({
        data: {
          userId,
          animeId: anime.id,
          status: mapStatusToEnum(status),
          removedFromMAL: false,
          needsRanking: true,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      continue;
    }

    if (existing.removedFromMAL) addedCount += 1;
    await prisma.userAnime.update({
      where: { id: existing.id },
      data: {
        status: mapStatusToEnum(status),
        removedFromMAL: false,
        needsRanking: existing.removedFromMAL ? true : existing.needsRanking,
        lastSeenAt: now,
      },
    });
  }

  // Soft-remove: anything previously active but no longer returned by MAL
  const previouslyActive = await prisma.userAnime.findMany({
    where: {
      userId,
      removedFromMAL: false,
      status: { in: [UserAnimeStatus.WATCHING, UserAnimeStatus.COMPLETED] },
    },
    include: { anime: { select: { malAnimeId: true } } },
  });

  const toRemoveIds = previouslyActive
    .filter((ua) => !currentMalIds.has(ua.anime.malAnimeId))
    .map((ua) => ua.id);

  const removedCount = toRemoveIds.length;

  if (removedCount > 0) {
    await prisma.userAnime.updateMany({
      where: { id: { in: toRemoveIds } },
      data: {
        removedFromMAL: true,
        needsRanking: false,
        lastSeenAt: now,
      },
    });
  }

  // Store last sync timestamp (optional)
  await prisma.user.update({
    where: { id: userId },
    data: { lastMalSyncAt: now },
  });

  const eligibleCount = await prisma.userAnime.count({
    where: {
      userId,
      removedFromMAL: false,
      status: { in: [UserAnimeStatus.WATCHING, UserAnimeStatus.COMPLETED] },
    },
  });

  const needsRankingCount = await prisma.userAnime.count({
    where: {
      userId,
      removedFromMAL: false,
      status: { in: [UserAnimeStatus.WATCHING, UserAnimeStatus.COMPLETED] },
      needsRanking: true,
    },
  });

  return { eligibleCount, needsRankingCount, addedCount, removedCount };
}
