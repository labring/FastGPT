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
          toolDescription: 'new description',
          defaultToAgentGenerated: true,
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
          toolDescription: 'source description',
          defaultToAgentGenerated: false
        }
      ]);

      const result = inheritToolInputConfig({ tool, sourceTool });

      expect(result.inputs[0]).toMatchObject({
        key: 'query',
        label: 'Old Query',
        value: 'manual value',
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
        selectedType: FlowNodeInputTypeEnum.input,
        toolDescription: 'new description',
        required: true
      });
      expect(result.inputs[0]).not.toHaveProperty('valueDesc');
      expect(result.inputs[0]).not.toHaveProperty('defaultToAgentGenerated');
      expect(result.inputs[1]).toMatchObject({
        key: 'limit',
        label: 'Limit',
        value: 10,
        required: true,
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.numberInput]
      });
      expect(result.inputs[1]).not.toHaveProperty('defaultToAgentGenerated');
      expect(result).not.toBe(tool);
    });

    it('should apply the default mode and omit defaultToAgentGenerated for a new tool', () => {
      const tool = createTool([
        {
          key: 'query',
          label: 'Query',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.input,
          defaultToAgentGenerated: true
        }
      ]);

      const result = inheritToolInputConfig({ tool });

      expect(result.inputs[0]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.agentGenerated
      });
      expect(result.inputs[0]).not.toHaveProperty('defaultToAgentGenerated');
    });

    it('should use the new type and clear value when the saved type is unavailable', () => {
      const result = inheritToolInputConfig({
        tool: createTool([
          {
            key: 'query',
            label: 'New Query',
            renderTypeList: [FlowNodeInputTypeEnum.numberInput],
            selectedType: FlowNodeInputTypeEnum.numberInput,
            value: 10
          }
        ]),
        sourceTool: createTool([
          {
            key: 'query',
            label: 'Saved Query',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            selectedType: FlowNodeInputTypeEnum.input,
            value: 'saved value'
          }
        ])
      });

      expect(result.inputs[0]).toMatchObject({
        label: 'Saved Query',
        selectedType: FlowNodeInputTypeEnum.numberInput
      });
      expect(result.inputs[0].value).toBeUndefined();
      expect(result.inputs[0].renderTypeList).toEqual([
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.numberInput
      ]);
    });

    it('should use defaultToAgentGenerated instead of toolDescription for a new system tool', () => {
      const tool = {
        ...createTool([
          {
            key: 'query',
            label: 'Query',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.input,
            defaultToAgentGenerated: false,
            toolDescription: 'Search query'
          }
        ]),
        pluginId: 'systemTool-search'
      };

      const result = inheritToolInputConfig({ tool });

      expect(result.inputs[0]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.input,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.input,
          FlowNodeInputTypeEnum.reference
        ]
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
            defaultToAgentGenerated: true,
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
            toolDescription: 'Search query'
          }
        ]),
        pluginId: 'systemTool-search'
      };

      const result = inheritToolInputConfig({ tool, sourceTool });

      expect(result.inputs[0]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.input
      });
      expect(result.inputs[1]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
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
            toolDescription: 'Search query'
          }
        ]),
        pluginId: 'mcp-app/search'
      };

      const result = inheritToolInputConfig({ tool, sourceTool: tool });

      expect(result.inputs[0]).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.input,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.input,
          FlowNodeInputTypeEnum.reference
        ]
      });
    });
  });
});
