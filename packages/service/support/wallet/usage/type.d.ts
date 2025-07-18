export type ConcatBillQueueItemType = {
  billId: string; // usageId
  listIndex?: number;
  totalPoints: number;

  // Model usage
  inputTokens?: number;
  outputTokens?: number;
  // Times
  count?: number;
};

declare global {
  var reduceAiPointsQueue: { teamId: string; totalPoints: number }[];
  var concatBillQueue: ConcatBillQueueItemType[];
}
