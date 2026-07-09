import { describe, expect, it } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { inheritToolInputConfig } from '@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/utils';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

const createTool = (inputs: FlowNodeTemplateType['inputs']) =>
  ({
    id: 'tool',
    name: 'Tool',
    flowNodeType: 'tool',
    templateType: 'test',
    inputs,
    outputs: []
  }) as unknown as FlowNodeTemplateType;

describe('ToolSelector utils', () => {
  describe('inheritToolInputConfig', () => {
    it('should inherit value and final input source state from existing tool config', () => {
      const tool = createTool([
        {
          key: 'query',
          label: 'Query',
          value: 'template value',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
          selectedTypeIndex: 0,
          toolDescription: 'new description',
          isToolParam: true,
          required: true
        },
        {
          key: 'limit',
          label: 'Limit',
          value: 10,
          renderTypeList: [FlowNodeInputTypeEnum.numberInput],
          required: true
        }
      ]);
      const sourceTool = createTool([
        {
          key: 'query',
          label: 'Old Query',
          value: 'manual value',
          valueDesc: 'manual desc',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.input,
          selectedTypeIndex: 0,
          toolDescription: 'source description',
          isToolParam: false
        }
      ]);

      const result = inheritToolInputConfig({ tool, sourceTool });

      expect(result.inputs[0]).toMatchObject({
        key: 'query',
        label: 'Query',
        value: 'manual value',
        valueDesc: 'manual desc',
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        selectedType: FlowNodeInputTypeEnum.input,
        selectedTypeIndex: 0,
        toolDescription: 'source description',
        isToolParam: false,
        required: true
      });
      expect(result.inputs[1]).toBe(tool.inputs[1]);
      expect(result).not.toBe(tool);
    });

    it('should return original tool when source config is missing', () => {
      const tool = createTool([]);

      expect(inheritToolInputConfig({ tool })).toBe(tool);
    });
  });
});
