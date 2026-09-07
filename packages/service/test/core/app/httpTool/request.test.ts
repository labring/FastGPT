import { describe, expect, it } from 'vitest';
import { buildOpenAPIHttpRequest } from '@fastgpt/service/core/app/httpTool/request';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import {
  getHTTPToolRuntimeSchemas,
  pathData2ToolList
} from '@fastgpt/global/core/app/tool/httpTool/utils';
import { assertToolRuntimeParams } from '@fastgpt/global/core/app/tool/runtime';
import { axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';

const makeSchema = (method = 'post') =>
  JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Echo', version: '1' },
    paths: {
      '/echo/{id}': {
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        [method]: {
          parameters: [
            { in: 'query', name: 'limit', schema: { type: 'integer' } },
            { in: 'header', name: 'X-Trace', schema: { type: 'string' } }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    profile: { type: 'object', properties: { name: { type: 'string' } } },
                    tags: { type: 'array', items: { type: 'string' } },
                    enabled: { type: 'boolean' },
                    count: { type: 'integer' },
                    nullable: { type: ['string', 'null'] }
                  },
                  required: ['profile', 'tags']
                }
              }
            }
          },
          responses: { '200': { description: 'OK' } }
        }
      }
    }
  });

describe('buildOpenAPIHttpRequest', () => {
  it('supports historical Swagger 2 JSON bodies without adding the wrapper parameter', async () => {
    const apiSchemaStr = JSON.stringify({
      swagger: '2.0',
      info: { title: 'Legacy', version: '1' },
      paths: {
        '/echo': {
          post: {
            parameters: [
              {
                in: 'body',
                name: 'body',
                schema: { type: 'object', properties: { value: { type: 'string' } } }
              }
            ],
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });
    const { pathData } = await str2OpenApiSchema(apiSchemaStr);
    const [tool] = await pathData2ToolList(pathData);
    expect(tool.inputSchema?.properties).not.toHaveProperty('body');
    expect(
      await buildOpenAPIHttpRequest({
        apiSchemaStr,
        method: 'POST',
        toolPath: '/echo',
        params: { value: 'legacy', nested: { active: false }, omitted: undefined }
      })
    ).toMatchObject({
      body: { value: 'legacy', nested: { active: false } },
      queryParams: undefined
    });
  });

  it.each([
    {
      label: 'non-JSON body',
      requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } },
      parameters: [],
      path: '/echo',
      params: {},
      error: 'Only application/json'
    },
    {
      label: 'array body',
      requestBody: {
        content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } }
      },
      parameters: [],
      path: '/echo',
      params: {},
      error: 'must be an object'
    },
    {
      label: 'missing query',
      parameters: [{ in: 'query', name: 'q', required: true, schema: { type: 'string' } }],
      path: '/echo',
      params: {},
      error: 'Missing OpenAPI query'
    },
    {
      label: 'undeclared path placeholder',
      parameters: [],
      path: '/echo/{id}',
      params: {},
      error: 'Missing OpenAPI path'
    },
    {
      label: 'dot path segment',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      path: '/echo/{id}',
      params: { id: '..' },
      error: 'Invalid OpenAPI path'
    },
    {
      label: 'unsupported cookie parameter',
      parameters: [{ in: 'cookie', name: 'session', schema: { type: 'string' } }],
      path: '/echo',
      params: { session: 'used-cookie' },
      error: 'Unsupported OpenAPI parameter location'
    },
    {
      label: 'missing required cookie',
      parameters: [{ in: 'cookie', name: 'session', required: true, schema: { type: 'string' } }],
      path: '/echo',
      params: {},
      error: 'Missing OpenAPI cookie'
    }
  ])(
    'rejects $label before sending an incomplete request',
    async ({ requestBody, parameters, path, params, error }) => {
      const apiSchemaStr = JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Invalid', version: '1' },
        paths: {
          [path]: { post: { parameters, requestBody, responses: { '200': { description: 'OK' } } } }
        }
      });
      await expect(
        buildOpenAPIHttpRequest({ apiSchemaStr, method: 'POST', toolPath: path, params })
      ).rejects.toThrow(error);
    }
  );

  it.each(['post', 'put', 'patch'])(
    'routes %s inputs and preserves native JSON values',
    async (method) => {
      const params = {
        id: 'a/b?c',
        limit: 0,
        'X-Trace': 'trace',
        profile: { name: '张三"\n' },
        tags: ['a', 'b'],
        enabled: false,
        count: 0,
        nullable: null,
        ignored: 'not-in-schema'
      };
      const request = await buildOpenAPIHttpRequest({
        apiSchemaStr: makeSchema(method),
        method,
        toolPath: '/echo/{id}',
        params
      });
      expect(request).toEqual({
        toolPath: '/echo/a%2Fb%3Fc',
        queryParams: new URLSearchParams('limit=0'),
        headers: { 'Content-Type': 'application/json', 'X-Trace': 'trace' },
        body: {
          profile: params.profile,
          tags: ['a', 'b'],
          enabled: false,
          count: 0,
          nullable: null
        }
      });
      expect(params.id).toBe('a/b?c');
    }
  );

  it('uses inherited parameters with operation-level overrides and does not invent a GET body', async () => {
    const apiSchemaStr = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'GET', version: '1' },
      paths: {
        '/search': {
          parameters: [{ in: 'query', name: 'q', required: true, schema: { type: 'string' } }],
          get: {
            parameters: [
              { in: 'query', name: 'q', required: false, schema: { type: 'string' } },
              { in: 'header', name: 'X-Tags', schema: { type: 'array', items: { type: 'string' } } }
            ],
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });
    expect(
      await buildOpenAPIHttpRequest({
        apiSchemaStr,
        toolPath: '/search',
        method: 'GET',
        params: { 'X-Tags': ['a', 'b'] }
      })
    ).toEqual({
      toolPath: '/search',
      queryParams: undefined,
      body: undefined,
      headers: { 'X-Tags': 'a,b' }
    });
  });

  it('keeps mixed query/path/header fields valid even with a strict body schema', async () => {
    const { pathData } = await str2OpenApiSchema(makeSchema());
    const [tool] = await pathData2ToolList(pathData);
    const { requestSchema } = getHTTPToolRuntimeSchemas(tool);
    expect(() =>
      assertToolRuntimeParams({
        jsonSchema: requestSchema,
        params: { id: '1', limit: 0, 'X-Trace': 'trace', profile: { name: 'test' }, tags: [] }
      })
    ).not.toThrow();
    expect(tool.inputSchema?.properties?.tags.items).toEqual({ type: 'string' });
  });

  it('skips unused optional cookies and sends repeated query keys without Axios array brackets', async () => {
    const apiSchemaStr = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'Search', version: '1' },
      paths: {
        '/search/{id}': {
          get: {
            parameters: [
              { in: 'cookie', name: 'session', required: false, schema: { type: 'string' } },
              { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
              { in: 'query', name: 'tags', schema: { type: 'array', items: { type: 'string' } } },
              { in: 'query', name: 'q', schema: { type: 'string' } },
              {
                in: 'header',
                name: 'X-Flags',
                style: 'simple',
                explode: true,
                schema: { type: 'object' }
              }
            ],
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });
    const request = await buildOpenAPIHttpRequest({
      apiSchemaStr,
      toolPath: '/search/{id}',
      method: 'GET',
      params: {
        id: 'a/b',
        tags: ['a', 'b'],
        q: '中文 &+#%',
        session: undefined,
        'X-Flags': { active: false, count: 0 }
      }
    });
    expect(
      axiosWithoutSSRF.getUri({
        baseURL: 'https://example.com',
        url: request.toolPath,
        params: request.queryParams
      })
    ).toBe('https://example.com/search/a%2Fb?tags=a&tags=b&q=%E4%B8%AD%E6%96%87+%26%2B%23%25');
    expect(request.headers).toEqual({ 'X-Flags': 'active=false,count=0' });
    expect(request.body).toBeUndefined();
  });

  it.each([
    { allowReserved: true },
    { content: { 'application/json': { schema: { type: 'object' } } } }
  ])('rejects unsupported encoding explicitly: %j', async (encoding) => {
    const apiSchemaStr = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'Encoding', version: '1' },
      paths: {
        '/echo': {
          get: {
            parameters: [{ in: 'query', name: 'q', ...encoding }],
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    });
    await expect(
      buildOpenAPIHttpRequest({
        apiSchemaStr,
        toolPath: '/echo',
        method: 'GET',
        params: { q: 'value' }
      })
    ).rejects.toThrow('Unsupported OpenAPI parameter encoding');
  });

  it('fails explicitly when the operation or required parameters are missing', async () => {
    const input = {
      apiSchemaStr: makeSchema(),
      toolPath: '/echo/{id}',
      method: 'POST',
      params: {}
    };
    await expect(buildOpenAPIHttpRequest(input)).rejects.toThrow('Missing OpenAPI path parameter');
    await expect(buildOpenAPIHttpRequest({ ...input, params: { id: '1' } })).rejects.toThrow(
      'Missing OpenAPI body parameter'
    );
    await expect(buildOpenAPIHttpRequest({ ...input, toolPath: '/unknown' })).rejects.toThrow(
      'OpenAPI operation not found'
    );
  });
});
