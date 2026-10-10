import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  getLocale: vi.fn(),
  rewriteAppWorkflowToDetail: vi.fn(),
  findOne: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: mocks.getLocale
}));

vi.mock('@fastgpt/service/core/app/utils', () => ({
  rewriteAppWorkflowToDetail: mocks.rewriteAppWorkflowToDetail
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    findOne: mocks.findOne
  }
}));

import handler from '@/pages/api/core/app/version/detail';

const appId = '68ad85a7463006c963799a05';
const versionId = '68ad85a7463006c963799a06';
const referenceSnapshots = [
  {
    reference: ['deleted-node', 'output'] as [string, string],
    sourceLabel: 'Deleted node'
  }
];

describe('GET /api/core/app/version/detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authApp.mockResolvedValue({
      app: { tmbId: '68ad85a7463006c963799a07' },
      teamId: '68ad85a7463006c963799a08',
      isRoot: false
    });
    mocks.getLocale.mockReturnValue('zh-CN');
    mocks.rewriteAppWorkflowToDetail.mockResolvedValue(undefined);
  });

  const setVersion = (version: Record<string, unknown>) => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: versionId,
        tmbId: '68ad85a7463006c963799a07',
        appId,
        time: new Date('2026-01-01T00:00:00.000Z'),
        nodes: [],
        edges: [],
        chatConfig: {},
        versionName: 'v1',
        ...version
      })
    });
  };

  it('preserves reference snapshots from a version', async () => {
    setVersion({ referenceSnapshots });

    const result = await handler({ query: { versionId, appId } } as any);

    expect(result.referenceSnapshots).toEqual(referenceSnapshots);
  });

  it('defaults missing reference snapshots for legacy versions', async () => {
    setVersion({});

    const result = await handler({ query: { versionId, appId } } as any);

    expect(result.referenceSnapshots).toEqual([]);
  });
});
