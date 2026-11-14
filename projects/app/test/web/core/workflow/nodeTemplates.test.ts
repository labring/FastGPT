import { describe, expect, it } from 'vitest';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { HttpToolSetNode } from '@fastgpt/global/core/workflow/template/system/httpToolSet';
import { McpToolSetNode } from '@fastgpt/global/core/workflow/template/system/mcpToolSet';
import { canDirectAddToolSet } from '../../../../src/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/list';

describe('workflow toolset template selection', () => {
  it('creates local nodes directly while keeping external toolsets as folders', () => {
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
