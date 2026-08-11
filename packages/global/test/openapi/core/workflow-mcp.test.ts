import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  WorkflowDebugBodySchema,
  WorkflowDebugResponseSchema,
  type WorkflowDebugBody,
  type WorkflowDebugResponse
} from '../../../openapi/core/workflow/api';
import type { ChatHistoryItemResType } from '../../../core/chat/type';
import type { RuntimeNodeItemType } from '../../../core/workflow/runtime/type';
import type { InteractiveNodeResponseType } from '../../../core/workflow/template/system/interactive/type';
import {
  McpServerToolCallBodySchema,
  McpServerToolListResponseSchema
} from '../../../openapi/support/mcpServer/api';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';

describe('Workflow debug and MCP runtime OpenAPI contracts', () => {
  it.each([
    ['/core/workflow/debug', 'post'],
    ['/support/mcp/server/toolCall', 'post'],
    ['/support/mcp/server/toolList', 'get']
  ] as const)('registers %s as %s', (path, method) => {
    expect(openAPIDocument.paths?.[path]?.[method]).toBeDefined();
  });

  it('groups workflow debug and MCP runtime endpoints correctly', () => {
    expect(openAPIDocument.paths?.['/core/workflow/debug']?.post?.tags).toEqual([
      DevApiTagsMap.workflowDebug
    ]);
    expect(openAPIDocument.paths?.['/support/mcp/server/toolCall']?.post?.tags).toEqual([
      DevApiTagsMap.mcpServer
    ]);
    expect(openAPIDocument.paths?.['/support/mcp/server/toolList']?.get?.tags).toEqual([
      DevApiTagsMap.mcpServer
    ]);
    expect(openAPITagGroups.find(({ name }) => name === '核心-应用管理')?.tags).toContain(
      DevApiTagsMap.workflowDebug
    );
  });

  it('applies workflow debug defaults without dropping dynamic response data', () => {
    expect(WorkflowDebugBodySchema.parse({ appId: '68ad85a7463006c963799a05' })).toMatchObject({
      nodes: [],
      edges: [],
      variables: {},
      query: [],
      history: []
    });

    const result = WorkflowDebugResponseSchema.parse({
      memoryEdges: [],
      memoryNodes: [],
      entryNodeIds: [],
      nodeResponses: {
        node1: {
          nodeId: 'node1',
          type: 'run',
          response: { customNodeResult: { nested: true } }
        }
      },
      newVariables: {},
      usageId: 'usage_debug_123'
    });

    expect(result.nodeResponses.node1.response).toEqual({
      customNodeResult: { nested: true }
    });
  });

  it('keeps workflow debug dynamic fields compatible with their legacy types', () => {
    type DebugNodeResponse = WorkflowDebugResponse['nodeResponses'][string];

    expectTypeOf<
      NonNullable<WorkflowDebugBody['nodes']>[number]
    >().toEqualTypeOf<RuntimeNodeItemType>();
    expectTypeOf<
      WorkflowDebugResponse['memoryNodes'][number]
    >().toEqualTypeOf<RuntimeNodeItemType>();
    expectTypeOf<
      NonNullable<DebugNodeResponse['response']>
    >().toEqualTypeOf<ChatHistoryItemResType>();
    expectTypeOf<
      NonNullable<DebugNodeResponse['interactiveResponse']>
    >().toEqualTypeOf<InteractiveNodeResponseType>();
  });

  it('validates MCP tool calls and preserves JSON Schema extensions', () => {
    expect(
      McpServerToolCallBodySchema.parse({
        key: 'mcp-key',
        toolName: 'search_knowledge',
        inputs: { question: 'FastGPT 是什么？' }
      })
    ).toMatchObject({ toolName: 'search_knowledge' });

    const tools = McpServerToolListResponseSchema.parse([
      {
        name: 'search_knowledge',
        description: '搜索知识库',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    ]);

    expect(tools[0].inputSchema.additionalProperties).toBe(false);
  });
});
