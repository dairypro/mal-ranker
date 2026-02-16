-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comparison" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "winnerAnimeId" TEXT NOT NULL,
    "loserAnimeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rating_userId_value_idx" ON "Rating"("userId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_animeId_key" ON "Rating"("userId", "animeId");

-- CreateIndex
CREATE INDEX "Comparison_userId_createdAt_idx" ON "Comparison"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Comparison_userId_winnerAnimeId_loserAnimeId_idx" ON "Comparison"("userId", "winnerAnimeId", "loserAnimeId");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_winnerAnimeId_fkey" FOREIGN KEY ("winnerAnimeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_loserAnimeId_fkey" FOREIGN KEY ("loserAnimeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
