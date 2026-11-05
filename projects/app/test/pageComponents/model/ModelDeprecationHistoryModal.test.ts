import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider, Table, Tbody } from '@chakra-ui/react';
import { theme } from '@fastgpt/web/styles/theme';

const mocks = vi.hoisted(() => ({
  recover: vi.fn(),
  retry: vi.fn(),
  buttons: [] as (() => void)[]
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: vi.fn(), ConfirmModal: () => null })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: unknown) => ({ runAsync: request })
}));
vi.mock('@/web/admin/system/inform/api', () => ({
  postListModelDeprecationFailures: vi.fn(),
  postListModelDeprecationInforms: vi.fn(),
  postRecoverModelDeprecationInformRun: mocks.recover,
  postRetryModelDeprecationInformRun: mocks.retry,
  postTerminateModelDeprecationInform: vi.fn()
}));
vi.mock('@chakra-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chakra-ui/react')>();
  return {
    ...actual,
    Button: ({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) => {
      if (children === 'config_model:model_deprecation.retry' && onClick)
        mocks.buttons.push(onClick);
      return React.createElement('button', null, children);
    }
  };
});
import {
  ModelDeprecationInformRunKindEnum,
  ModelDeprecationInformRunStatusEnum
} from '@fastgpt/global/support/user/inform/constants';
import { describe, expect, it, vi } from 'vitest';
import {
  getLatestModelDeprecationRuns,
  HistoryRow
} from '@/pageComponents/model/ModelDeprecationHistoryModal';

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

describe('history recovery', () => {
  it.each([
    ModelDeprecationInformRunStatusEnum.failed,
    ModelDeprecationInformRunStatusEnum.interrupted
  ])('requeues the latest %s retry run with its original index', (status) => {
    mocks.buttons.length = 0;
    mocks.recover.mockClear();
    mocks.retry.mockClear();
    const runs = [
      run(0, ModelDeprecationInformRunKindEnum.delivery, '2026-01-01T00:00:00.000Z'),
      { ...run(1, ModelDeprecationInformRunKindEnum.retry, '2026-01-02T00:00:00.000Z', 0), status }
    ];
    renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { theme },
        React.createElement(
          Table,
          null,
          React.createElement(
            Tbody,
            null,
            React.createElement(HistoryRow, {
              item: {
                id: 'plan',
                models: [],
                plannedDeprecationAt: '2026-12-31',
                createdAt: '2026-01-01T00:00:00.000Z',
                runs
              },
              modelNames: new Map(),
              channelLabels: {} as any,
              onRefresh: vi.fn()
            })
          )
        )
      )
    );
    expect(mocks.buttons).toHaveLength(1);
    mocks.buttons[0]();
    expect(mocks.recover).toHaveBeenCalledWith({ campaignId: 'plan', runIndex: 1 });
    expect(mocks.retry).not.toHaveBeenCalled();
  });
});
