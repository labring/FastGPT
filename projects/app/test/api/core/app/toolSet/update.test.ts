import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { UpdateHttpToolsBodyType } from '@fastgpt/global/openapi/core/app/httpTools/api';
import type { UpdateMcpToolsBodyType } from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  mongoSessionRun: vi.fn(),
  updateAppPublishedVersion: vi.fn(),
  beforeUpdateAppFormat: vi.fn(),
  updateParentFoldersUpdateTime: vi.fn(),
  assertMCPUrlNotInternal: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.mongoSessionRun
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  updateAppPublishedVersion: mocks.updateAppPublishedVersion
}));

vi.mock('@fastgpt/service/core/app/controller', () => ({
  beforeUpdateAppFormat: mocks.beforeUpdateAppFormat,
  updateParentFoldersUpdateTime: mocks.updateParentFoldersUpdateTime
}));

vi.mock('@fastgpt/service/common/secret/utils', () => ({
  storeSecretValue: vi.fn((value) => value)
}));

vi.mock('@fastgpt/service/core/app/mcp', () => ({
  assertMCPUrlNotInternal: mocks.assertMCPUrlNotInternal
}));

import updateHttpTools from '@/pages/api/core/app/httpTools/update';
import updateMcpTools from '@/pages/api/core/app/mcpTools/update';

const appId = '65f000000000000000000071';
const versionId = '65f000000000000000000072';

describe('tool set update handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authApp.mockResolvedValue({
      app: {
        _id: appId,
        name: 'Tool set',
        avatar: '',
        parentId: 'parent-id',
        publishedVersionId: versionId
      },
      teamId: 'team-id'
    });
    mocks.beforeUpdateAppFormat.mockResolvedValue(undefined);
    mocks.assertMCPUrlNotInternal.mockResolvedValue(undefined);
    mocks.mongoSessionRun.mockImplementation(async (fn: (session: string) => Promise<unknown>) =>
      fn('session')
    );
    mocks.updateAppPublishedVersion.mockRejectedValue(AppErrEnum.unExist);
  });

  it.each([
    {
      name: 'HTTP',
      handler: updateHttpTools,
      body: { appId, toolList: [] } as UpdateHttpToolsBodyType
    },
    {
      name: 'MCP',
      handler: updateMcpTools,
      body: { appId, url: 'https://example.com/mcp', toolList: [] } as UpdateMcpToolsBodyType
    }
  ])('propagates a $name published-version update failure', async ({ handler, body }) => {
    await expect(handler({ body } as ApiRequestProps<any>)).rejects.toBe(AppErrEnum.unExist);

    expect(mocks.updateAppPublishedVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        appId,
        resources: [],
        session: 'session'
      })
    );
    expect(mocks.updateParentFoldersUpdateTime).not.toHaveBeenCalled();
  });
});
