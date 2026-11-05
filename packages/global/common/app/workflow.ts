import { normalizeLegacyAppVariable, normalizeLegacyToolSetConfig } from './legacy/utils';
import {
  chatHistoryValueDesc,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  VariableInputEnum,
  NodeOutputKeyEnum,
  NodeInputKeyEnum
} from '../../core/workflow/constants';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../core/workflow/type/io';
import type { NodeToolConfigType, StoreNodeItemType } from '../../core/workflow/type/node';
import { ToolSetToolSummarySchema } from '../../core/app/tool/toolSet/type';
import type { AppChatConfigType } from '../../core/app/type';
import {
  Input_Template_File_Link,
  Input_Template_History,
  Input_Template_Stream_MODE,
  Input_Template_UserChatInput
} from '../../core/workflow/template/input';
import { i18nT } from '../i18n/utils';
import {
  getOrInitModuleInputValue,
  projectExternalVariableInput,
  getAppVariableRenderTypeList
} from '../workflow/input';

export const pluginData2FlowNodeIO = ({
  nodes
}: {
  nodes: StoreNodeItemType[];
}): {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
} => {
  const pluginInput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput);
  const pluginOutput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput);

  return {
    inputs: pluginInput
      ? [
          Input_Template_Stream_MODE,
          ...pluginInput?.inputs.map((item) =>
            projectExternalVariableInput({
              ...item,
              value: getOrInitModuleInputValue(item),
              canEdit: false
            })
          )
        ]
      : [],
    outputs: pluginOutput
      ? pluginOutput.inputs.map((item) => ({
          id: item.key,
          type: FlowNodeOutputTypeEnum.static,
          key: item.key,
          valueType: item.valueType,
          label: item.label || item.key,
          description: item.description
        }))
      : []
  };
};

export const appData2FlowNodeIO = ({
  chatConfig
}: {
  chatConfig?: AppChatConfigType;
}): {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
} => {
  const variableInput = !chatConfig?.variables
    ? []
    : chatConfig.variables.map(normalizeLegacyAppVariable).map((item) => {
        const supportsOptions = [
          VariableInputEnum.select,
          VariableInputEnum.multipleSelect
        ].includes(item.type);
        return projectExternalVariableInput({
          key: item.key,
          renderTypeList: getAppVariableRenderTypeList({
            type: item.type,
            valueType: item.valueType
          }),
          label: item.label,
          debugLabel: item.label,
          description: item.description,
          valueType: item.valueType || WorkflowIOValueTypeEnum.any,
          required: item.required,
          defaultValue: item.defaultValue,
          value: item.defaultValue,
          ...(supportsOptions
            ? {
                list: item.list
                  ?.map((enumItem) => ({
                    label: enumItem.value,
                    value: enumItem.value
                  }))
                  .filter((enumItem) => String(enumItem.value ?? '').trim().length > 0)
              }
            : {})
        });
      });

  return {
    inputs: [
      Input_Template_Stream_MODE,
      Input_Template_History,
      ...(chatConfig?.fileSelectConfig?.canSelectFile ||
      chatConfig?.fileSelectConfig?.canSelectImg ||
      chatConfig?.fileSelectConfig?.canSelectVideo ||
      chatConfig?.fileSelectConfig?.canSelectAudio ||
      chatConfig?.fileSelectConfig?.canSelectCustomFileExtension
        ? [Input_Template_File_Link]
        : []),
      Input_Template_UserChatInput,
      ...variableInput
    ],
    outputs: [
      {
        id: NodeOutputKeyEnum.history,
        key: NodeOutputKeyEnum.history,
        required: true,
        label: i18nT('common:core.module.output.label.New context'),
        description: i18nT('common:core.module.output.description.New context'),
        valueType: WorkflowIOValueTypeEnum.chatHistory,
        valueDesc: chatHistoryValueDesc,
        type: FlowNodeOutputTypeEnum.static
      },
      {
        id: NodeOutputKeyEnum.answerText,
        key: NodeOutputKeyEnum.answerText,
        required: false,
        label: i18nT('common:core.module.output.label.Ai response content'),
        description: i18nT('common:core.module.output.description.Ai response content'),
        valueType: WorkflowIOValueTypeEnum.string,
        type: FlowNodeOutputTypeEnum.static
      }
    ]
  };
};

export const toolData2FlowNodeIO = ({ nodes }: { nodes: StoreNodeItemType[] }) => {
  const toolNode = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.tool);

  return {
    inputs: toolNode?.inputs || [],
    outputs: toolNode?.outputs || [],
    toolConfig: toolNode?.toolConfig
  };
};

/** 工具集预览只携带引用和展示摘要，不携带执行 Schema。 */
export const toolSetData2FlowNodeIO = ({
  nodes,
  toolSetId
}: {
  nodes: StoreNodeItemType[];
  toolSetId: string;
}) => {
  const toolSetNode = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);

  const normalizedConfig = normalizeLegacyToolSetConfig({
    config: toolSetNode?.toolConfig,
    toolSetId
  });

  // 预览只保留摘要，执行配置不进入新节点。
  const toolConfig: NodeToolConfigType | undefined = (() => {
    if (!normalizedConfig) return undefined;

    if (normalizedConfig.httpToolSet) {
      const toolSet = normalizedConfig.httpToolSet;
      return {
        httpToolSet: {
          toolId: toolSet.toolId,
          toolList: ToolSetToolSummarySchema.array().parse(toolSet.toolList ?? [])
        }
      };
    }
    if (normalizedConfig.mcpToolSet) {
      const toolSet = normalizedConfig.mcpToolSet;
      return {
        mcpToolSet: {
          toolId: toolSet.toolId,
          toolList: ToolSetToolSummarySchema.array().parse(toolSet.toolList ?? [])
        }
      };
    }

    return normalizedConfig;
  })();

  return {
    inputs: toolSetNode?.inputs || [],
    outputs: toolSetNode?.outputs || [],
    toolConfig,
    showSourceHandle: false,
    showTargetHandle: false
  };
};

/** 判断 App 工作流是否有 Agent 或 ToolCall 节点开启 Sandbox。 */
export const isAppSandboxEnabledInNodes = (nodes: StoreNodeItemType[]) =>
  nodes.some(
    (node) =>
      (node.flowNodeType === FlowNodeTypeEnum.agent ||
        node.flowNodeType === FlowNodeTypeEnum.toolCall) &&
      node.inputs.some(
        (input) => input.key === NodeInputKeyEnum.useAgentSandbox && input.value === true
      )
  );
