import { describe, expect, it } from 'vitest';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import { pathData2ToolList } from '@fastgpt/global/core/app/tool/httpTool/utils';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import {
  getHttpToolSetConfigError,
  getMcpToolSetConfigError,
  getNodeHttpToolListForSave
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/toolSetUtils';

const openApiSchemaStr = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Example API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/search': {
      get: {
        operationId: 'search',
        parameters: [{ in: 'query', name: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } }
      }
    },
    '/items': {
      post: {
        operationId: 'createItem',
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } } }
            }
          }
        },
        responses: { '201': { description: 'Created' } }
      }
    }
  }
});

const getImportedTools = async () => {
  const { pathData } = await str2OpenApiSchema(openApiSchemaStr);
  return pathData2ToolList(pathData);
};

describe('MCP ToolSet config validation', () => {
  const validTool = {
    name: 'search',
    description: 'Search',
    inputSchema: { type: 'object', properties: {} }
  };

  it('accepts valid HTTP(S) URLs and rejects invalid or empty config', () => {
    expect(
      getMcpToolSetConfigError({ url: 'https://mcp.example.com', toolList: [validTool] })
    ).toBeUndefined();
    expect(getMcpToolSetConfigError({ url: 'file:///tmp/mcp', toolList: [validTool] })).toBe(
      'invalid_url'
    );
    expect(getMcpToolSetConfigError({ url: 'https://mcp.example.com', toolList: [] })).toBe(
      'empty_tool_list'
    );
  });

  it('rejects empty or duplicate names and invalid input schemas', () => {
    const error = (tool: typeof validTool) =>
      getMcpToolSetConfigError({ url: 'https://mcp.example.com', toolList: [tool] });

    expect(error({ ...validTool, name: '  ' })).toBe('empty_tool_name');
    expect(error({ ...validTool, inputSchema: 'invalid' })).toBe('invalid_tool_schema');
  });
});

describe('HTTP ToolSet config validation', () => {
  it('accepts all imported operations and node-local operation subsets', async () => {
    const toolList = await getImportedTools();
    const config = {
      baseUrl: 'https://api.example.com',
      apiSchemaStr: openApiSchemaStr,
      customHeaders: '{}'
    };

    await expect(getHttpToolSetConfigError({ ...config, toolList })).resolves.toBeUndefined();
    await expect(
      getHttpToolSetConfigError({ ...config, toolList: [toolList[0]], allowToolSubset: true })
    ).resolves.toBeUndefined();
    await expect(
      getHttpToolSetConfigError({ ...config, toolList: [], allowToolSubset: true })
    ).resolves.toBeUndefined();
    await expect(getHttpToolSetConfigError({ ...config, toolList: [toolList[0]] })).resolves.toBe(
      'invalid_operation'
    );
  });

  it('keeps the current subset unless OpenAPI changes or is explicitly re-imported', () => {
    const currentToolList = [{ name: 'kept' }] as HttpToolConfigType[];
    const importedToolList = [{ name: 'kept' }, { name: 'new' }] as HttpToolConfigType[];
    const config = {
      currentToolList,
      importedToolList,
      currentApiSchemaStr: openApiSchemaStr,
      nextApiSchemaStr: openApiSchemaStr,
      isExplicitImport: false
    };

    expect(getNodeHttpToolListForSave(config)).toBe(currentToolList);
    expect(
      getNodeHttpToolListForSave({ ...config, nextApiSchemaStr: `${openApiSchemaStr} ` })
    ).toBe(importedToolList);
    expect(getNodeHttpToolListForSave({ ...config, isExplicitImport: true })).toBe(
      importedToolList
    );
  });

  it('rejects invalid URLs, headers, operations, and schemas', async () => {
    const toolList = await getImportedTools();
    const config = {
      baseUrl: 'https://api.example.com',
      apiSchemaStr: openApiSchemaStr,
      customHeaders: '{}',
      toolList
    };

    await expect(
      getHttpToolSetConfigError({ ...config, baseUrl: 'ftp://api.example.com' })
    ).resolves.toBe('invalid_base_url');
    await expect(getHttpToolSetConfigError({ ...config, customHeaders: '[]' })).resolves.toBe(
      'invalid_custom_headers'
    );
    await expect(
      getHttpToolSetConfigError({ ...config, customHeaders: '{"X-Count":1}' })
    ).resolves.toBe('invalid_custom_headers');
    await expect(
      getHttpToolSetConfigError({
        ...config,
        toolList: [{ ...toolList[0], path: '/missing' }, toolList[1]]
      })
    ).resolves.toBe('invalid_operation');
    await expect(
      getHttpToolSetConfigError({
        ...config,
        toolList: [{ ...toolList[0], requestSchema: { type: 123 } }, toolList[1]]
      })
    ).resolves.toBe('invalid_tool_schema');
  });
});
