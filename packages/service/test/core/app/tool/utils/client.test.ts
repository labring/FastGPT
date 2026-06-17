import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  getAppVersionById: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: mocks.findById
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: mocks.getAppVersionById,
  checkIsLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn()
  }
}));

import { getClientToolPreviewNode } from '@fastgpt/service/core/app/tool/utils/client';

describe('getClientToolPreviewNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits runtime schema fields from client preview response', async () => {
    mocks.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        teamId: '507f1f77bcf86cd799439012',
        type: AppTypeEnum.httpToolSet,
        name: 'HTTP Tools',
        avatar: 'http.svg',
        intro: 'HTTP toolset'
      })
    });
    mocks.getAppVersionById.mockResolvedValueOnce({
      nodes: [
        {
          toolConfig: {
            httpToolSet: {
              toolList: [
                {
                  name: 'search',
                  description: 'Search tool',
                  requestSchema: { type: 'object', properties: { q: { type: 'string' } } },
                  inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
                  outputSchema: { type: 'object', properties: { result: { type: 'string' } } }
                }
              ]
            }
          }
        }
      ],
      edges: [],
      chatConfig: {},
      versionId: 'version-id',
      versionName: 'Version 1'
    });

    const result = await getClientToolPreviewNode({
      appId: 'http-507f1f77bcf86cd799439011/search',
      lang: 'en'
    });

    expect(result).not.toHaveProperty('jsonSchema');
    expect(result).not.toHaveProperty('inputSchema');
    expect(result).not.toHaveProperty('outputSchema');
    expect(result).not.toHaveProperty('secretSchema');
    expect(result.toolConfig?.httpTool).toEqual({
      toolId: 'http-507f1f77bcf86cd799439011/search'
    });
    expect(result.inputs[0]?.key).toBe('q');
    expect((result as any).jsonSchema).toBeUndefined();
  });
});
