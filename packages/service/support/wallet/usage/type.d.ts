export type ConcatBillQueueItemType = {
  billId: string;
  listIndex?: number;
  totalPoints: number;
  inputTokens: number;
  outputTokens: number;
};

declare global {
  var reduceAiPointsQueue: { teamId: string; totalPoints: number }[];
  var concatBillQueue: ConcatBillQueueItemType[];
}
