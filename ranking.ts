// Temporary fixed threshold for faster UX feedback while testing.
export function requiredComparisons(eligibleCount: number) {
  void eligibleCount;
  return 4;
}

export function eloUpdate(winner: number, loser: number, k = 32) {
  const expectedWinner = 1 / (1 + Math.pow(10, (loser - winner) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinner = winner + k * (1 - expectedWinner);
  const newLoser = loser + k * (0 - expectedLoser);

  return { newWinner, newLoser };
}
