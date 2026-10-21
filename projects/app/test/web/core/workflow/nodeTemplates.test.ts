import { describe, expect, it } from 'vitest';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { HttpToolSetNode } from '@fastgpt/global/core/workflow/template/system/httpToolSet';
import { McpToolSetNode } from '@fastgpt/global/core/workflow/template/system/mcpToolSet';
import { StopToolNode } from '@fastgpt/global/core/workflow/template/system/stopTool';
import { ToolParamsNode } from '@fastgpt/global/core/workflow/template/system/toolParams';
import { workflowSystemNodeTemplateList } from '@fastgpt/web/core/workflow/constants';
import { canDirectAddToolSet } from '../../../../src/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/list';

describe('workflow toolset template selection', () => {
  it('places tool-call nodes in a separate section after tools', () => {
    const templateTypes = workflowSystemNodeTemplateList.map(({ type }) => type);
    const toolsIndex = templateTypes.indexOf(FlowNodeTemplateTypeEnum.tools);
    const toolCallNodes = [McpToolSetNode, HttpToolSetNode, ToolParamsNode, StopToolNode];

    expect(templateTypes[toolsIndex + 1]).toBe(FlowNodeTemplateTypeEnum.toolCall);
    expect(toolCallNodes.map(({ templateType }) => templateType)).toEqual(
      Array(toolCallNodes.length).fill(FlowNodeTemplateTypeEnum.toolCall)
    );
  });

  it('creates local MCP nodes from the sidebar while keeping external toolsets as folders', () => {
    const localMcpTemplate = {
      id: McpToolSetNode.id,
      flowNodeType: FlowNodeTypeEnum.toolSet,
      templateType: FlowNodeTemplateTypeEnum.toolCall
    };
    const externalTemplate = {
      id: 'team-mcp-app',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      templateType: FlowNodeTemplateTypeEnum.tools
    };
    const externalTemplateWithConflictingId = {
      id: McpToolSetNode.id,
      flowNodeType: FlowNodeTypeEnum.toolSet,
      templateType: FlowNodeTemplateTypeEnum.tools
    };

    expect(
      canDirectAddToolSet({
        template: localMcpTemplate,
        isPopover: false,
        isToolSelector: false
      })
    ).toBe(true);
    expect(
      canDirectAddToolSet({
        template: externalTemplate,
        isPopover: false,
        isToolSelector: false
      })
    ).toBe(false);
    expect(
      canDirectAddToolSet({
        template: externalTemplateWithConflictingId,
        isPopover: false,
        isToolSelector: false
      })
    ).toBe(false);
    expect(
      canDirectAddToolSet({
        template: localMcpTemplate,
        isPopover: true,
        isToolSelector: true
      })
    ).toBe(true);
  });

  it('creates local HTTP nodes directly from the sidebar', () => {
    expect(
      canDirectAddToolSet({
        template: {
          id: HttpToolSetNode.id,
          flowNodeType: FlowNodeTypeEnum.toolSet,
          templateType: FlowNodeTemplateTypeEnum.toolCall
        },
        isPopover: false,
        isToolSelector: false
      })
    ).toBe(true);
  });
});
