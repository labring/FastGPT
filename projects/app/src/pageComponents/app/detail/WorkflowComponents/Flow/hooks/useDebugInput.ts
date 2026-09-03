import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type { FileSelectorValueItemType } from '@/components/core/app/FileSelector/type';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { WorkflowReferenceSourceNode } from '@/web/core/workflow/utils';
import { workflowReferenceValueIsSelectable } from '@/web/core/workflow/referenceCheck';

const primitiveValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.string,
  WorkflowIOValueTypeEnum.number,
  WorkflowIOValueTypeEnum.boolean
]);

/** 入口节点没有可供调试表单解析的上游引用，需要直接展示自身全部输入。 */
export const debugNodeShouldShowAllInputs = (flowNodeType: FlowNodeTypeEnum) =>
  flowNodeType === FlowNodeTypeEnum.workflowStart || flowNodeType === FlowNodeTypeEnum.pluginInput;

const fileSelectEnabled = (config?: AppFileSelectConfigType) =>
  !!(
    config?.canSelectFile ||
    config?.canSelectImg ||
    config?.canSelectVideo ||
    config?.canSelectAudio ||
    config?.canSelectCustomFileExtension
  );

/** 根据应用文件配置，为流程开始节点生成仅用于调试表单的文件输入。 */
export const getWorkflowStartDebugFileInput = ({
  flowNodeType,
  fileSelectConfig
}: {
  flowNodeType: FlowNodeTypeEnum;
  fileSelectConfig?: AppFileSelectConfigType;
}): FlowNodeInputItemType | undefined => {
  if (flowNodeType !== FlowNodeTypeEnum.workflowStart || !fileSelectEnabled(fileSelectConfig)) {
    return;
  }

  return {
    key: NodeOutputKeyEnum.userFiles,
    label: i18nT('app:workflow.user_file_input'),
    description: i18nT('app:workflow.user_file_input_desc'),
    renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
    valueType: WorkflowIOValueTypeEnum.arrayString,
    required: false,
    value: [],
    canLocalUpload: true,
    canUrlUpload: true,
    ...fileSelectConfig
  };
};

/** 将流程开始节点的调试表单转换为 Workflow 根 query，文件 key 由服务端按 chatId 鉴权解析。 */
export const getWorkflowStartDebugQuery = ({
  flowNodeType,
  nodeVariables = {}
}: {
  flowNodeType: FlowNodeTypeEnum;
  nodeVariables?: Record<string, any>;
}): UserChatItemValueItemType[] | undefined => {
  if (flowNodeType !== FlowNodeTypeEnum.workflowStart) return;

  const text = nodeVariables[NodeInputKeyEnum.userChatInput];
  const rawFiles = nodeVariables[NodeOutputKeyEnum.userFiles];
  const files: FileSelectorValueItemType[] = Array.isArray(rawFiles) ? rawFiles : [];

  return [
    ...files.map((file) => ({
      file: {
        type: file.type,
        name: file.name,
        url: ('url' in file ? file.url : undefined) ?? '',
        ...('key' in file && file.key ? { key: file.key } : {})
      }
    })),
    ...(typeof text === 'string' && text
      ? [
          {
            text: {
              content: text
            }
          }
        ]
      : [])
  ];
};

/** 兼容旧文件变量：编辑器一直将缺失的 canSelectFile 视为允许普通文件。 */
export const getDebugGlobalVariableFormProps = (variable: VariableItemType) => {
  if (
    variable.type !== VariableInputEnum.file ||
    (variable.canSelectFile !== undefined && variable.canLocalUpload !== undefined)
  ) {
    return variable;
  }

  return {
    ...variable,
    canSelectFile: variable.canSelectFile ?? true,
    canLocalUpload: variable.canLocalUpload ?? true
  };
};

/**
 * 节点调试只补两类输入：入口节点的全部参数，以及普通节点里由引用或 Agent 生成的参数。
 * 引用参数仅在来源节点、输出和值类型均有效时展示；Agent 生成参数始终由调试者临时填写。
 * 其他已配置好的节点参数保持原值，不因空值或默认值额外展示调试输入框。
 */
export const checkInputShouldRenderInDebug = (
  input: FlowNodeInputItemType,
  options?: {
    showAllInputs?: boolean;
    referenceSourceNodes?: WorkflowReferenceSourceNode[];
  }
) => {
  if (options?.showAllInputs) return true;

  if (getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.agentGenerated) return true;

  return (
    nodeInputIsReference(input) &&
    workflowReferenceValueIsSelectable({
      value: input.value,
      sourceNodes: options?.referenceSourceNodes ?? [],
      valueType: input.valueType
    })
  );
};

export const getDebugInputFormValue = (input: FlowNodeInputItemType) => {
  if (nodeInputIsReference(input)) return undefined;
  if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)) {
    return Array.isArray(input.value) ? input.value : [];
  }

  const value = input.value;
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }

  return value;
};

export const getDebugInputFormProps = (input: FlowNodeInputItemType) => {
  const props = { ...input };
  delete props.value;
  delete props.defaultValue;

  if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)) {
    return {
      ...props,
      canSelectFile: props.canSelectFile ?? true,
      canLocalUpload: props.canLocalUpload ?? true
    };
  }

  return props;
};

const parseDebugInputFormValue = (input: FlowNodeInputItemType, value: any) => {
  if (primitiveValueTypes.has(input.valueType as WorkflowIOValueTypeEnum)) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const getDebugRuntimeInputs = ({
  inputs,
  nodeVariables = {}
}: {
  inputs: FlowNodeInputItemType[];
  nodeVariables?: Record<string, any>;
}) => {
  return inputs.map((input) => {
    if (!Object.prototype.hasOwnProperty.call(nodeVariables, input.key)) {
      return input;
    }

    return {
      ...input,
      value: parseDebugInputFormValue(input, nodeVariables[input.key])
    };
  });
};
