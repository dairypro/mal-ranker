"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

type HomeData =
  | { loggedIn: false }
  | {
      loggedIn: true;
      malUsername: string;
      eligibleCount: number;
      needsRankingCount: number;
      lastMalSyncAt: string | null;
    };

type MatchupAnime = {
  animeId: string;
  title: string;
  imageUrl: string | null;
  malAnimeId: number;
};

type MatchupResponse = {
  A: MatchupAnime;
  B: MatchupAnime;
};

type RankedAnime = {
  rank: number;
  animeId: string;
  title: string;
  imageUrl: string | null;
  malAnimeId: number;
  rating: number;
};

type SyncResponse = {
  ok: true;
  eligibleCount: number;
  needsRankingCount: number;
  addedCount: number;
  removedCount: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

function scoreToTen(rank: number, total: number) {
  if (total <= 1) return "10.0";
  const normalized = (rank - 1) / (total - 1);
  const score = 10 - normalized * 9;
  return score.toFixed(1);
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ranked, setRanked] = useState<RankedAnime[]>([]);
  const [loadingRanked, setLoadingRanked] = useState(false);

  const [rankingOpen, setRankingOpen] = useState(false);
  const [currentMatchup, setCurrentMatchup] = useState<MatchupResponse | null>(null);
  const [loadingMatchup, setLoadingMatchup] = useState(false);
  const [submittingChoice, setSubmittingChoice] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const loadRankedList = useCallback(async () => {
    setLoadingRanked(true);
    try {
      const res = await fetch("/api/rank/list", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { items: RankedAnime[] };
      setRanked(json.items);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, "Failed to load ranked list"));
      setRanked([]);
    } finally {
      setLoadingRanked(false);
    }
  }, []);

  const loadHome = useCallback(async () => {
    setError(null);

    const res = await fetch("/api/home", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(await res.text());
    }

    const json = (await res.json()) as HomeData;
    setData(json);

    if (json.loggedIn && json.eligibleCount >= 10) {
      await loadRankedList();
      return;
    }

    setRanked([]);
  }, [loadRankedList]);

  async function sync() {
    setSyncing(true);
    setError(null);
    setSyncSummary(null);
    try {
      const res = await fetch("/api/mal/sync", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as SyncResponse;
      setSyncSummary(
        `Sync complete: ${json.addedCount} added, ${json.removedCount} removed.`
      );
      await loadHome();
    } catch (syncError: unknown) {
      setError(getErrorMessage(syncError, "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  async function loadNextMatchup() {
    setLoadingMatchup(true);
    setRankingError(null);

    try {
      const res = await fetch("/api/rank/next", { cache: "no-store" });

      if (res.status === 204) {
        setCurrentMatchup(null);
        await loadHome();
        return;
      }

      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as MatchupResponse;
      setCurrentMatchup(json);
    } catch (matchupError: unknown) {
      setRankingError(getErrorMessage(matchupError, "Failed to get next matchup"));
      setCurrentMatchup(null);
    } finally {
      setLoadingMatchup(false);
    }
  }

  async function openRanking() {
    setRankingOpen(true);
    await loadNextMatchup();
  }

  function closeRanking() {
    setRankingOpen(false);
    setCurrentMatchup(null);
    setRankingError(null);
  }

  async function submitChoice(winnerAnimeId: string, loserAnimeId: string) {
    setSubmittingChoice(true);
    setRankingError(null);

    try {
      const res = await fetch("/api/rank/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winnerAnimeId, loserAnimeId }),
      });

      if (!res.ok) throw new Error(await res.text());

      await loadHome();
      await loadNextMatchup();
    } catch (submitError: unknown) {
      setRankingError(getErrorMessage(submitError, "Failed to submit comparison"));
    } finally {
      setSubmittingChoice(false);
    }
  }

  async function copyShareUrl() {
    if (!data || !data.loggedIn) return;

    const shareUrl = `${window.location.origin}/u/${encodeURIComponent(data.malUsername)}`;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API not available");
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Share URL copied.");
    } catch {
      setShareMessage(`Copy failed. URL: ${shareUrl}`);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        await loadHome();
      } catch (initError: unknown) {
        setError(getErrorMessage(initError, "Failed to load home data"));
      }
    }

    init();
  }, [loadHome]);

  const eligibleCount = data && data.loggedIn ? data.eligibleCount : 0;
  const gateOpen = data !== null && data.loggedIn && data.eligibleCount >= 10;

  const syncLabel = useMemo(() => {
    if (syncing) return "Syncing...";
    return "Sync MAL";
  }, [syncing]);

  const rankingButtonLabel = useMemo(() => {
    if (!data || !data.loggedIn) return "Start ranking";
    return data.needsRankingCount > 0 ? "Start / Continue ranking" : "Re-rank";
  }, [data]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">MyAnimeList Ranker</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pairwise ranking for your Watching + Completed list.
        </p>

        {error && (
          <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {syncSummary && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {syncSummary}
          </div>
        )}
        {shareMessage && (
          <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            {shareMessage}
          </div>
        )}

        {data === null && <div className="mt-10 animate-pulse text-zinc-400">Loading...</div>}

        {data !== null && data.loggedIn === false && (
          <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
            <p className="text-sm text-zinc-300">
              Log in with MyAnimeList to import your anime list and start ranking.
            </p>
            <a
              href="/api/auth/mal/start"
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
            >
              Login with MAL
            </a>
          </div>
        )}

        {data !== null && data.loggedIn === true && (
          <>
            <div className="mt-8 flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div>
                <div className="text-sm text-zinc-400">Signed in as</div>
                <div className="font-medium">{data.malUsername}</div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={copyShareUrl}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
                >
                  Copy share URL
                </button>

                <button
                  onClick={sync}
                  disabled={syncing}
                  className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
                >
                  {syncLabel}
                </button>
              </div>
            </div>

            {!gateOpen && (
              <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
                <div className="text-lg font-semibold">Not enough anime to rank yet</div>
                <p className="mt-2 text-sm text-zinc-300">
                  You have <span className="font-semibold">{eligibleCount}</span> / 10 eligible anime
                  (Watching + Completed). Add more on MyAnimeList, then sync.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={sync}
                    disabled={syncing}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
                  >
                    {syncLabel}
                  </button>

                  <a
                    href="https://myanimelist.net"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
                  >
                    Open MyAnimeList
                  </a>
                </div>
              </div>
            )}

            {gateOpen && (
              <>
                <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold">Your ranked list</div>
                      <p className="mt-1 text-sm text-zinc-300">
                        Eligible anime: <span className="font-semibold">{data.eligibleCount}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-black">
                        Unranked: {data.needsRankingCount}
                      </div>

                      <button
                        onClick={openRanking}
                        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
                      >
                        {rankingButtonLabel}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                  {loadingRanked && <div className="text-sm text-zinc-400">Loading ranked list...</div>}

                  {!loadingRanked && ranked.length === 0 && (
                    <div className="text-sm text-zinc-400">
                      No ranked items yet. Start ranking to generate scores.
                    </div>
                  )}

                  {!loadingRanked && ranked.length > 0 && (
                    <div className="space-y-2">
                      {ranked.map((item) => (
                        <div
                          key={item.animeId}
                          className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-2"
                        >
                          <div className="w-9 text-center text-sm font-semibold text-zinc-300">
                            #{item.rank}
                          </div>

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
                              {scoreToTen(item.rank, ranked.length)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {rankingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Choose the better anime</div>
                <p className="mt-1 text-sm text-zinc-400">Your choice updates both ratings immediately.</p>
              </div>

              <button
                onClick={closeRanking}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            {rankingError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
                {rankingError}
              </div>
            )}

            {loadingMatchup && (
              <div className="mt-6 rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-400">
                Finding next matchup...
              </div>
            )}

            {!loadingMatchup && !currentMatchup && (
              <div className="mt-6 rounded-xl border border-zinc-800 p-6 text-center">
                <div className="text-base font-medium">You are caught up for now.</div>
                <p className="mt-2 text-sm text-zinc-400">
                  Sync after adding anime on MAL, or come back later to keep refining.
                </p>
              </div>
            )}

            {!loadingMatchup && currentMatchup && (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[currentMatchup.A, currentMatchup.B].map((anime, idx) => {
                  const isLeft = idx === 0;
                  const winnerAnimeId = anime.animeId;
                  const loserAnimeId = isLeft ? currentMatchup.B.animeId : currentMatchup.A.animeId;

                  return (
                    <button
                      key={anime.animeId}
                      disabled={submittingChoice}
                      onClick={() => submitChoice(winnerAnimeId, loserAnimeId)}
                      className="rounded-2xl border border-zinc-700 bg-zinc-950/70 p-3 text-left hover:border-zinc-500 disabled:opacity-70"
                    >
                      <div className="h-56 overflow-hidden rounded-xl bg-zinc-800">
                        {anime.imageUrl ? (
                          <Image
                            src={anime.imageUrl}
                            alt={anime.title}
                            width={640}
                            height={896}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                            No image available
                          </div>
                        )}
                      </div>

                      <div className="mt-3 text-base font-semibold">{anime.title}</div>
                      <div className="mt-1 text-xs text-zinc-400">MAL #{anime.malAnimeId}</div>
                      <div className="mt-3 text-sm font-medium text-zinc-200">Choose this one</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
