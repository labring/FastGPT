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
    it('should inherit value and explicit input selection while keeping the current tool schema', () => {
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
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
        selectedType: FlowNodeInputTypeEnum.input,
        selectedTypeIndex: 1,
        toolDescription: 'new description',
        required: true
      });
      expect(result.inputs[0]).not.toHaveProperty('isToolParam');
      expect(result.inputs[1]).toMatchObject(tool.inputs[1]);
      expect(result.inputs[1]).not.toHaveProperty('isToolParam');
      expect(result).not.toBe(tool);
    });

    it('should apply the default mode and omit isToolParam for a new tool', () => {
      const tool = createTool([
        {
          key: 'query',
          label: 'Query',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.input,
          selectedTypeIndex: 0,
          isToolParam: true
        }
      ]);

      const result = inheritToolInputConfig({ tool });

      expect(result.inputs[0]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        selectedTypeIndex: 0
      });
      expect(result.inputs[0]).not.toHaveProperty('isToolParam');
    });

    it('should use isToolParam instead of toolDescription for a new system tool', () => {
      const tool = {
        ...createTool([
          {
            key: 'query',
            label: 'Query',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.input,
            selectedTypeIndex: 0,
            isToolParam: false,
            toolDescription: 'Search query'
          }
        ]),
        pluginId: 'systemTool-search'
      };

      const result = inheritToolInputConfig({ tool });

      expect(result.inputs[0]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.input,
        selectedTypeIndex: 0,
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
      });
    });

    it('should restore a new legacy system tool input while keeping saved selections', () => {
      const tool = {
        ...createTool([
          {
            key: 'query',
            label: 'Query',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
            toolDescription: 'Search query'
          },
          {
            key: 'count',
            label: 'Count',
            valueType: 'number',
            renderTypeList: [FlowNodeInputTypeEnum.numberInput],
            isToolParam: true,
            toolDescription: 'Result count'
          }
        ]),
        pluginId: 'systemTool-search'
      };
      const sourceTool = {
        ...createTool([
          {
            key: 'query',
            label: 'Query',
            renderTypeList: [
              FlowNodeInputTypeEnum.agentGenerated,
              FlowNodeInputTypeEnum.input,
              FlowNodeInputTypeEnum.reference
            ],
            selectedType: FlowNodeInputTypeEnum.input,
            selectedTypeIndex: 1,
            toolDescription: 'Search query'
          }
        ]),
        pluginId: 'systemTool-search'
      };

      const result = inheritToolInputConfig({ tool, sourceTool });

      expect(result.inputs[0]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.input,
        selectedTypeIndex: 0
      });
      expect(result.inputs[1]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        selectedTypeIndex: 0,
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.numberInput]
      });
    });

    it('should not apply toolDescription fallback to MCP tools', () => {
      const tool = {
        ...createTool([
          {
            key: 'query',
            label: 'Query',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
            selectedTypeIndex: 0,
            toolDescription: 'Search query'
          }
        ]),
        pluginId: 'mcp-app/search'
      };

      const result = inheritToolInputConfig({ tool, sourceTool: tool });

      expect(result.inputs[0]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.input,
        selectedTypeIndex: 0,
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
      });
    });
  });
});
