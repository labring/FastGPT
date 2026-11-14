import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AgentToolSchema } from '@fastgpt/global/core/app/tool/type';
import { McpToolConfigSchema } from '@fastgpt/global/core/app/tool/mcpTool/type';
import {
  PublishAppBodySchema,
  PublishMcpToolSetAppBodySchema
} from '@fastgpt/global/openapi/core/app/version/api';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowStoreNodeItemSchema } from '@fastgpt/global/core/workflow/type/node';

const requestMeta = { 'example/context': { locale: 'zh-CN' } };
const tool = { name: 'search', description: '', requestMeta };
const toolConfig = { mcpToolSet: { url: 'https://mcp.example.com', toolList: [tool] } };
const snapshotNode = () => ({
  nodeId: 'tools',
  name: 'Tools',
  flowNodeType: FlowNodeTypeEnum.toolSet,
  inputs: [],
  outputs: [],
  toolConfig: structuredClone(toolConfig)
});

describe('MCP metadata persistence ownership', () => {
  it('normalizes publish metadata according to the authorized application type', () => {
    const input = { nodes: [snapshotNode()], isPublish: true };
    // 上游发布边界只允许工具本体提交完整配置，工作流必须提交摘要。
    expect(PublishAppBodySchema.safeParse(input).success).toBe(false);
    const body = PublishMcpToolSetAppBodySchema.parse(input);
    const toolSet = migrateWorkflowToCurrent(
      { ...body, nodes: body.nodes! },
      { appType: AppTypeEnum.mcpToolSet }
    );
    expect(toolSet.nodes[0].toolConfig?.mcpToolSet?.toolList?.[0]).toHaveProperty(
      'requestMeta',
      requestMeta
    );
    expect(tool.requestMeta).toEqual(requestMeta);
  });

  it('strips metadata when normalizing ordinary workflows', () => {
    const workflow = migrateWorkflowToCurrent({ nodes: [snapshotNode()] });
    expect(workflow.nodes[0].toolConfig?.mcpToolSet?.toolList?.[0]).not.toHaveProperty(
      'requestMeta'
    );
  });

  it('strips metadata from Agent tool references during schema parsing and workflow normalization', () => {
    const selectedTool = { id: 'mcp-tools/search', toolConfig, config: {} };
    expect(
      AgentToolSchema.parse(selectedTool).toolConfig?.mcpToolSet?.toolList?.[0]
    ).not.toHaveProperty('requestMeta');
    const workflow = migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'agent',
          name: 'Agent',
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              label: 'Tools',
              renderTypeList: [FlowNodeInputTypeEnum.custom],
              value: [selectedTool]
            }
          ],
          outputs: []
        }
      ]
    });
    expect(
      workflow.nodes[0].inputs[0].value[0].toolConfig.mcpToolSet.toolList[0]
    ).not.toHaveProperty('requestMeta');
  });

  it('retains the upstream single-toolset invariant in the persisted schema', () => {
    const node = snapshotNode();
    const parsed = WorkflowStoreNodeItemSchema.safeParse({
      ...node,
      toolConfig: { ...node.toolConfig, httpToolSet: { toolList: [] } }
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['toolConfig', 'httpToolSet'],
          message: '工具集节点只能配置 MCP 或 HTTP 工具集'
        })
      );
    }
  });

  it('preserves metadata in the tool-owned config schema', () => {
    expect(McpToolConfigSchema.parse(tool)).toHaveProperty('requestMeta', requestMeta);
  });

  it('preserves metadata while normalizing the MCP toolset itself', () => {
    const workflow = migrateWorkflowToCurrent(
      { nodes: [snapshotNode()] },
      { appType: AppTypeEnum.mcpToolSet }
    );
    expect(workflow.nodes[0].toolConfig?.mcpToolSet?.toolList?.[0]).toHaveProperty(
      'requestMeta',
      requestMeta
    );
  });
});
