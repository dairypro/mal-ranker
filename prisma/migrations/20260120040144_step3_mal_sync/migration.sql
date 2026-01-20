-- CreateEnum
CREATE TYPE "UserAnimeStatus" AS ENUM ('WATCHING', 'COMPLETED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastMalSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Anime" (
    "id" TEXT NOT NULL,
    "malAnimeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAnime" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "status" "UserAnimeStatus" NOT NULL,
    "removedFromMAL" BOOLEAN NOT NULL DEFAULT false,
    "needsRanking" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comparisonsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserAnime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Anime_malAnimeId_key" ON "Anime"("malAnimeId");

-- CreateIndex
CREATE INDEX "UserAnime_userId_removedFromMAL_needsRanking_idx" ON "UserAnime"("userId", "removedFromMAL", "needsRanking");

-- CreateIndex
CREATE INDEX "UserAnime_userId_status_idx" ON "UserAnime"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserAnime_userId_animeId_key" ON "UserAnime"("userId", "animeId");

-- AddForeignKey
ALTER TABLE "UserAnime" ADD CONSTRAINT "UserAnime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAnime" ADD CONSTRAINT "UserAnime_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
