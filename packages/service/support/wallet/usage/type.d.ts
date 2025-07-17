export type ConcatBillQueueItemType = {
  billId: string;
  listIndex?: number;
  totalPoints: number;
  inputTokens: number;
  outputTokens: number;
  count?: number;
};

declare global {
  var reduceAiPointsQueue: { teamId: string; totalPoints: number }[];
  var concatBillQueue: ConcatBillQueueItemType[];
}
