import type { ConcatUsageProps } from '@fastgpt/global/support/wallet/usage/api';

declare global {
  var reduceAiPointsQueue: { teamId: string; totalPoints: number }[];
  var concatBillQueue: ConcatUsageProps[];
}
