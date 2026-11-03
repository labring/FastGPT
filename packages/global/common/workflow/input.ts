import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum,
  VariableInputEnum
} from '../../core/workflow/constants';
import type { FlowNodeInputItemType } from '../../core/workflow/type/io';
import type { VariableItemType } from '../../core/app/variable/type';

/**
 * 根据节点类型和系统 key 确认凭据容器，迁移与保存共用，禁止仅凭同名业务字段推断。
 * 密码控件和 inputList 的密钥声明由各自的显式字段元数据识别。
 */
export const getWorkflowSecretInputKind = ({
  flowNodeType,
  inputKey
}: {
  flowNodeType: unknown;
  inputKey: unknown;
}): 'headers' | 'systemConfig' | undefined => {
  if (
    flowNodeType === FlowNodeTypeEnum.httpRequest468 &&
    inputKey === NodeInputKeyEnum.headerSecret
  ) {
    return 'headers';
  }
  if (
    (flowNodeType === FlowNodeTypeEnum.tool ||
      flowNodeType === FlowNodeTypeEnum.toolSet ||
      flowNodeType === FlowNodeTypeEnum.pluginModule) &&
    inputKey === NodeInputKeyEnum.systemInputConfig
  ) {
    return 'systemConfig';
  }
  return undefined;
};

export const getOrInitModuleInputValue = (input: FlowNodeInputItemType) => {
  if (input.value !== undefined || !input.valueType) return input.value;
  if (input.defaultValue !== undefined) return input.defaultValue;

  const map: Record<string, any> = {
    [WorkflowIOValueTypeEnum.boolean]: false,
    [WorkflowIOValueTypeEnum.number]: 0,
    [WorkflowIOValueTypeEnum.string]: ''
  };

  return map[input.valueType];
};

const agentGeneratedExternalVariableValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.string,
  WorkflowIOValueTypeEnum.number,
  WorkflowIOValueTypeEnum.boolean,
  WorkflowIOValueTypeEnum.arrayString,
  WorkflowIOValueTypeEnum.arrayNumber,
  WorkflowIOValueTypeEnum.arrayBoolean
]);

/**
 * 将子工作流外部变量投影为父工作流可配置的节点输入。
 * customVariable 只描述子工作流的外部注入语义；进入父工作流后由引用或类型匹配的手动控件提供值。
 * 已保存且投影后仍有效的输入方式必须保留，只有未选择或仍为 customVariable 时才应用 Agent 默认值。
 */
export const projectExternalVariableInput = <T extends FlowNodeInputItemType>(input: T): T => {
  const isExternalVariable =
    input.renderTypeList.includes(FlowNodeInputTypeEnum.customVariable) ||
    input.selectedType === FlowNodeInputTypeEnum.customVariable;
  if (!isExternalVariable) return input;

  const manualRenderType = (() => {
    if (input.valueType === WorkflowIOValueTypeEnum.number) {
      return FlowNodeInputTypeEnum.numberInput;
    }
    if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
      return FlowNodeInputTypeEnum.switch;
    }
    if (input.valueType === WorkflowIOValueTypeEnum.string) {
      return FlowNodeInputTypeEnum.input;
    }
    return FlowNodeInputTypeEnum.JSONEditor;
  })();
  const canAgentGenerated = agentGeneratedExternalVariableValueTypes.has(
    input.valueType as WorkflowIOValueTypeEnum
  );
  const projectedRenderTypeList = Array.from(
    new Set(
      input.renderTypeList.flatMap((type) => {
        if (type === FlowNodeInputTypeEnum.customVariable) {
          return [FlowNodeInputTypeEnum.reference, manualRenderType];
        }
        if (type === FlowNodeInputTypeEnum.agentGenerated) {
          return canAgentGenerated ? [type] : [];
        }
        return [type];
      })
    )
  );
  if (
    canAgentGenerated &&
    !projectedRenderTypeList.includes(FlowNodeInputTypeEnum.agentGenerated)
  ) {
    projectedRenderTypeList.unshift(FlowNodeInputTypeEnum.agentGenerated);
  }
  if (!projectedRenderTypeList.includes(FlowNodeInputTypeEnum.reference)) {
    projectedRenderTypeList.push(FlowNodeInputTypeEnum.reference);
  }
  if (!projectedRenderTypeList.includes(manualRenderType)) {
    projectedRenderTypeList.push(manualRenderType);
  }
  const hasExplicitProjectedSelection =
    input.selectedType !== undefined &&
    input.selectedType !== FlowNodeInputTypeEnum.customVariable &&
    projectedRenderTypeList.includes(input.selectedType);
  const selectedType = hasExplicitProjectedSelection
    ? input.selectedType
    : canAgentGenerated
      ? FlowNodeInputTypeEnum.agentGenerated
      : FlowNodeInputTypeEnum.reference;
  const projectedInput = {
    ...input,
    canAgentGenerated,
    ...(canAgentGenerated ? { defaultToAgentGenerated: true } : {}),
    renderTypeList: projectedRenderTypeList,
    selectedType
  } as T;

  return projectedInput;
};

const jsonRenderValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.object,
  WorkflowIOValueTypeEnum.arrayString,
  WorkflowIOValueTypeEnum.arrayNumber,
  WorkflowIOValueTypeEnum.arrayBoolean,
  WorkflowIOValueTypeEnum.arrayObject
]);

/** 将应用变量类型映射为工作流节点输入控件，供应用节点和工具参数配置共用。 */
export const getAppVariableRenderTypeList = ({
  type,
  valueType
}: Pick<VariableItemType, 'type' | 'valueType'>): FlowNodeInputTypeEnum[] => {
  const isJsonValueType = !!valueType && jsonRenderValueTypes.has(valueType);
  const renderTypeMap: Record<VariableInputEnum, FlowNodeInputTypeEnum[]> = {
    [VariableInputEnum.input]: isJsonValueType
      ? [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference]
      : [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
    [VariableInputEnum.textarea]: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
    [VariableInputEnum.numberInput]: [FlowNodeInputTypeEnum.numberInput],
    [VariableInputEnum.select]: [FlowNodeInputTypeEnum.select],
    [VariableInputEnum.multipleSelect]: [FlowNodeInputTypeEnum.multipleSelect],
    [VariableInputEnum.timePointSelect]: [FlowNodeInputTypeEnum.timePointSelect],
    [VariableInputEnum.timeRangeSelect]: [FlowNodeInputTypeEnum.timeRangeSelect],
    [VariableInputEnum.switch]: [FlowNodeInputTypeEnum.switch],
    [VariableInputEnum.password]: [FlowNodeInputTypeEnum.password],
    [VariableInputEnum.file]: [FlowNodeInputTypeEnum.fileSelect, FlowNodeInputTypeEnum.reference],
    [VariableInputEnum.llmSelect]: [FlowNodeInputTypeEnum.selectLLMModel],
    [VariableInputEnum.datasetSelect]: [FlowNodeInputTypeEnum.selectDataset],
    [VariableInputEnum.internal]: [FlowNodeInputTypeEnum.hidden],
    [VariableInputEnum.custom]: [FlowNodeInputTypeEnum.customVariable]
  };

  return renderTypeMap[type] || [FlowNodeInputTypeEnum.reference];
};
