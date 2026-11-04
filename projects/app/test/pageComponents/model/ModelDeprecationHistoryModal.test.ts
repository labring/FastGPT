import {
  ModelDeprecationInformRunKindEnum,
  ModelDeprecationInformRunStatusEnum
} from '@fastgpt/global/support/user/inform/constants';
import { describe, expect, it } from 'vitest';
import { getLatestModelDeprecationRuns } from '@/pageComponents/model/ModelDeprecationHistoryModal';

const run = (
  runIndex: number,
  kind: ModelDeprecationInformRunKindEnum,
  scheduledAt: string,
  sourceRunIndex?: number
) => ({
  runIndex,
  kind,
  scheduledAt,
  status: ModelDeprecationInformRunStatusEnum.completed,
  failureCount: 0,
  ...(sourceRunIndex !== undefined && { sourceRunIndex })
});

describe('getLatestModelDeprecationRuns', () => {
  it('keeps only the tail of each retry chain and all independent runs', () => {
    const runs = [
      run(0, ModelDeprecationInformRunKindEnum.delivery, '2026-01-01T00:00:00.000Z'),
      run(1, ModelDeprecationInformRunKindEnum.retry, '2026-01-04T00:00:00.000Z', 0),
      run(2, ModelDeprecationInformRunKindEnum.retry, '2026-01-05T00:00:00.000Z', 1),
      run(3, ModelDeprecationInformRunKindEnum.delivery, '2026-01-03T00:00:00.000Z')
    ];

    expect(getLatestModelDeprecationRuns(runs)).toEqual([runs[2], runs[3]]);
  });

  it('orders retry tails by the scheduled date of their chain roots', () => {
    const runs = [
      run(0, ModelDeprecationInformRunKindEnum.delivery, '2026-01-01T00:00:00.000Z'),
      run(1, ModelDeprecationInformRunKindEnum.delivery, '2026-01-03T00:00:00.000Z'),
      run(2, ModelDeprecationInformRunKindEnum.delivery, '2026-01-05T00:00:00.000Z'),
      run(3, ModelDeprecationInformRunKindEnum.retry, '2026-01-07T00:00:00.000Z', 0)
    ];

    expect(getLatestModelDeprecationRuns(runs)).toEqual([runs[3], runs[1], runs[2]]);
  });
});
