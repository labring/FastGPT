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
import {
  workflowReferenceValueIsSelectable,
  type WorkflowReferenceSourceNode
} from '@/web/core/workflow/utils';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';

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

/** 仅识别文档解析节点在单节点调试时需要临时覆盖的文件 URL 输入。 */
export const isDebugReadFilesInput = ({
  flowNodeType,
  input
}: {
  flowNodeType?: FlowNodeTypeEnum;
  input: FlowNodeInputItemType;
}) => flowNodeType === FlowNodeTypeEnum.readFiles && input.key === NodeInputKeyEnum.fileUrlList;

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

export const getDebugInputFormProps = (
  input: FlowNodeInputItemType,
  options?: {
    flowNodeType?: FlowNodeTypeEnum;
    maxFiles?: number;
  }
) => {
  const props = { ...input };
  delete props.value;
  delete props.defaultValue;

  if (
    isDebugReadFilesInput({
      flowNodeType: options?.flowNodeType,
      input
    })
  ) {
    return {
      ...props,
      renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
      canSelectFile: true,
      canLocalUpload: true,
      canUrlUpload: true,
      maxFiles: options?.maxFiles
    };
  }

  if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)) {
    return {
      ...props,
      canSelectFile: props.canSelectFile ?? true,
      canLocalUpload: props.canLocalUpload ?? true
    };
  }

  return props;
};

/** 统一生成节点调试字段属性和控件类型，避免控件类型继续读取转换前的 renderTypeList。 */
export const getDebugInputFormConfig = (
  input: FlowNodeInputItemType,
  options?: Parameters<typeof getDebugInputFormProps>[1]
) => {
  const inputProps = getDebugInputFormProps(input, options);

  return {
    inputProps,
    inputType: nodeInputTypeToInputType(inputProps.renderTypeList)
  };
};

/** 将调试表单中的外部 URL 与私有文件 key 按原顺序转换为节点运行输入。 */
export const resolveDebugReadFilesInput = async ({
  files,
  resolveFileKey
}: {
  files: FileSelectorValueItemType[];
  resolveFileKey: (key: string) => Promise<string>;
}) =>
  Promise.all(
    files.map((file) => {
      if (file.url) return file.url;
      if (file.key) return resolveFileKey(file.key);

      return Promise.reject(new Error('Invalid debug file: URL or key is required'));
    })
  );

type DebugReadFilesSubmissionToken = {
  version: number;
  id: number;
};

/**
 * 隔离文档解析异步提交：同一时刻只允许一个提交，抽屉或节点变化后旧结果立即失效。
 * finish 只会结束对应的活跃提交，避免旧请求完成时清除新请求状态。
 */
export const createDebugReadFilesSubmissionController = () => {
  let version = 0;
  let activeSubmissionId: number | undefined;
  let nextSubmissionId = 0;

  const isCurrent = (token: DebugReadFilesSubmissionToken) =>
    token.version === version && token.id === activeSubmissionId;

  return {
    begin: (): DebugReadFilesSubmissionToken | undefined => {
      if (activeSubmissionId !== undefined) return;

      activeSubmissionId = ++nextSubmissionId;
      return {
        version,
        id: activeSubmissionId
      };
    },
    isCurrent,
    finish: (token: DebugReadFilesSubmissionToken) => {
      if (!isCurrent(token)) return false;

      activeSubmissionId = undefined;
      return true;
    },
    invalidate: () => {
      version += 1;
      activeSubmissionId = undefined;
    }
  };
};

export type DebugReadFilesSubmissionController = ReturnType<
  typeof createDebugReadFilesSubmissionController
>;

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
