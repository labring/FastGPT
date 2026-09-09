import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  getLocale: vi.fn(),
  rewriteAppWorkflowToDetail: vi.fn()
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

import handler from '@/pages/api/core/app/detail';

const appId = '68ad85a7463006c963799a05';

describe('GET /api/core/app/detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocale.mockReturnValue('zh-CN');
    mocks.rewriteAppWorkflowToDetail.mockResolvedValue(undefined);
    mocks.authApp.mockResolvedValue({
      app: {
        _id: appId,
        teamId: '68ad85a7463006c963799a06',
        tmbId: '68ad85a7463006c963799a07',
        type: AppTypeEnum.workflow,
        name: '历史应用',
        avatar: '/icon/logo.svg',
        intro: '',
        updateTime: '2026-01-01T00:00:00.000Z',
        modules: [],
        edges: [],
        chatConfig: {
          questionGuide: null
        },
        permission: new AppPermission({ role: ReadRoleVal })
      },
      teamId: '68ad85a7463006c963799a06',
      isRoot: false
    });
  });

  it('uses the chat config schema default for read-only apps with a legacy null value', async () => {
    const result = await handler({ query: { appId } } as any);

    expect(result.chatConfig).toEqual({});
    expect(result.modules).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
