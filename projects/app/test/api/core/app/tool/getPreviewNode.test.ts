import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  getClientToolPreviewNode: vi.fn(),
  getLocale: vi.fn(),
  authApp: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/utils/client', () => ({
  getClientToolPreviewNode: mocks.getClientToolPreviewNode
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: mocks.getLocale
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

import handler from '@/pages/api/core/app/tool/getPreviewNode';

describe('get preview node handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocale.mockReturnValue('zh');
    mocks.getClientToolPreviewNode.mockResolvedValue({
      id: 'node-id',
      pluginId: 'systemTool-weather',
      source: 'debug:tmbId:tmb-1',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Weather',
      inputs: [],
      outputs: []
    });
  });

  it('passes debug source explicitly without encoding it into appId', async () => {
    const res = await Call(handler, {
      query: {
        appId: 'systemTool-weather',
        versionId: '',
        source: 'debug:tmbId:tmb-1'
      }
    });

    expect(res.code).toBe(200);
    expect(mocks.getClientToolPreviewNode).toHaveBeenCalledWith({
      appId: 'systemTool-weather',
      versionId: '',
      getLatestVersion: undefined,
      lang: 'zh',
      source: 'debug:tmbId:tmb-1'
    });
    expect(res.data).toMatchObject({
      pluginId: 'systemTool-weather',
      source: 'debug:tmbId:tmb-1'
    });
  });
});
