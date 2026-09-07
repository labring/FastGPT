import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { GetMcpChildrenResponseSchema } from '@fastgpt/global/openapi/core/app/mcpTools/api';

const mocks = vi.hoisted(() => ({ authApp: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({ authApp: mocks.authApp }));
import handler from '@/pages/api/core/app/tool/getToolSetChildren';

const appId = '507f1f77bcf86cd799439011';
const createToolset = (type: AppTypeEnum) => ({
  _id: appId,
  type,
  avatar: 'tools.svg',
  modules: [
    {
      toolConfig: {
        [type === AppTypeEnum.mcpToolSet ? 'mcpToolSet' : 'httpToolSet']: {
          url: 'https://mcp.example.com',
          baseUrl: 'https://http.example.com',
          apiSchemaStr: 'raw OpenAPI',
          toolList: [
            {
              name: 'Search[1]',
              description: 'Search',
              path: '/private',
              method: 'POST',
              staticHeaders: [{ key: 'X-Private', value: 'private-config' }],
              staticParams: [{ key: 'token', value: 'private-config' }],
              inputSchema: JSON.stringify({
                type: 'object',
                properties: { privateField: { type: 'string' } }
              }),
              requestSchema: JSON.stringify({ type: 'object' }),
              outputSchema: JSON.stringify({ type: 'object' })
            }
          ]
        }
      }
    }
  ]
});

describe('getToolSetChildren', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([AppTypeEnum.mcpToolSet, AppTypeEnum.httpToolSet])(
    'returns only display fields from encoded %s definitions',
    async (type) => {
      const app = createToolset(type);
      const original = structuredClone(app);
      mocks.authApp.mockResolvedValueOnce({ app });
      const result = await Call(handler, { query: { appId, searchKey: ' search[1] ' } });
      expect(result.code).toBe(200);
      expect(result.data).toEqual({
        type,
        tools: [
          {
            id: `${type === AppTypeEnum.mcpToolSet ? 'mcp' : 'http'}-${appId}/Search[1]`,
            name: 'Search[1]',
            description: 'Search',
            avatar: 'tools.svg'
          }
        ]
      });
      expect(mocks.authApp).toHaveBeenCalledWith(
        expect.objectContaining({ appId, per: ReadPermissionVal, authToken: true })
      );
      expect(app).toEqual(original);
    }
  );

  it.each([undefined, '', '   ', 'missing'])(
    'handles empty and nonmatching searches: %j',
    async (searchKey) => {
      mocks.authApp.mockResolvedValueOnce({ app: createToolset(AppTypeEnum.httpToolSet) });
      const result = await Call(handler, { query: { appId, searchKey } });
      expect(result.code).toBe(200);
      expect(result.data.tools).toHaveLength(searchKey === 'missing' ? 0 : 1);
    }
  );

  it('returns only resource type for a normal folder', async () => {
    mocks.authApp.mockResolvedValueOnce({
      app: { ...createToolset(AppTypeEnum.httpToolSet), type: AppTypeEnum.toolFolder }
    });
    const result = await Call(handler, { query: { appId } });
    expect(result.data).toEqual({ type: AppTypeEnum.toolFolder, tools: [] });
  });

  it('rejects invalid ids before accessing resources', async () => {
    const result = await Call(handler, { query: { appId: 'invalid' } });
    expect(result.code).not.toBe(200);
    expect(mocks.authApp).not.toHaveBeenCalled();
  });

  it('does not return definitions when authorization fails', async () => {
    mocks.authApp.mockRejectedValueOnce(new Error('unAuthApp'));
    const result = await Call(handler, { query: { appId } });
    expect(result.code).not.toBe(200);
    expect(result.data?.tools).toBeUndefined();
  });

  it('keeps the existing MCP children API schema contract unchanged', () => {
    expect(
      GetMcpChildrenResponseSchema.parse([
        {
          id: `mcp-${appId}/search`,
          name: 'search',
          description: 'Search',
          avatar: '',
          inputSchema: { type: 'object' },
          url: 'https://private.example.com',
          headerSecret: { token: 'secret' }
        }
      ])
    ).toEqual([
      {
        id: `mcp-${appId}/search`,
        name: 'search',
        description: 'Search',
        avatar: '',
        inputSchema: { type: 'object' }
      }
    ]);
  });
});
