import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { parseWorkflowImportConfig } from '@/pageComponents/dashboard/agent/utils/appTemplateParse';

describe('parseWorkflowImportConfig', () => {
  it('migrates workflow imports before the service boundary and remains idempotent', async () => {
    const workflow = await parseWorkflowImportConfig({
      config: {
        type: AppTypeEnum.workflowTool,
        nodes: [
          {
            nodeId: 'plugin-input',
            flowNodeType: 'pluginInput',
            name: 'Plugin input',
            inputs: [
              {
                key: NodeInputKeyEnum.systemInputConfig,
                label: 'System config',
                renderTypeList: [FlowNodeInputTypeEnum.input],
                inputList: [
                  {
                    key: 'token',
                    label: 'Token',
                    inputType: 'secret',
                    value: { value: 'plain', secret: 'cipher' }
                  }
                ]
              }
            ],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {}
      },
      appType: AppTypeEnum.workflowTool,
      t: (key: string) => key
    });

    expect(workflow.nodes[0].inputs[0].inputList?.[0].value).toEqual({ value: 'plain' });
    expect(migrateWorkflowToCurrent(workflow)).toEqual(workflow);
  });
});
