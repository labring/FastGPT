import { describe, expect, it } from 'vitest';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  flattenResponse,
  getSideTabItems
} from '@/components/core/chat/components/WholeResponseModal/responseData';

const workflowBuilderToolResponse = {
  id: 'response-id',
  nodeId: 'node-id',
  moduleType: FlowNodeTypeEnum.tool,
  moduleName: 'Workflow CLI Stage',
  moduleLogo: 'generic-tool-logo',
  toolId: 'workflow_cli_stage'
} as ChatHistoryItemResType;

describe('Workflow Builder tool response presentation', () => {
  it('uses the same localized name and Figma icon in response content', () => {
    expect(flattenResponse([workflowBuilderToolResponse])[0]).toMatchObject({
      moduleName: 'workflow:workflow_builder_tool_stage',
      moduleLogo: 'core/chat/workflowBuilder/stage'
    });
  });

  it('uses the same localized name and Figma icon in the response side tab', () => {
    expect(getSideTabItems([workflowBuilderToolResponse])[0]).toMatchObject({
      moduleName: 'workflow:workflow_builder_tool_stage',
      moduleLogo: 'core/chat/workflowBuilder/stage'
    });
  });
});
