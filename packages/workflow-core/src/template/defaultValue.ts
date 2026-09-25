import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { NodeInputAutomationMeta, WorkflowResourceKind } from './type';

const arrayValueTypes = new Set<string>([
  WorkflowIOValueTypeEnum.arrayString,
  WorkflowIOValueTypeEnum.arrayNumber,
  WorkflowIOValueTypeEnum.arrayBoolean,
  WorkflowIOValueTypeEnum.arrayObject,
  WorkflowIOValueTypeEnum.arrayAny,
  WorkflowIOValueTypeEnum.chatHistory,
  WorkflowIOValueTypeEnum.datasetQuote,
  WorkflowIOValueTypeEnum.selectDataset
]);

const cloneValue = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

/** 返回不会伪造远端资源、且与输入值类型兼容的初始空值。 */
export const getResourceSafeEmptyValue = ({
  valueType,
  resourceKind
}: {
  valueType?: string;
  resourceKind?: WorkflowResourceKind;
}): unknown => {
  if (resourceKind === 'dataset' || valueType === WorkflowIOValueTypeEnum.selectDataset) {
    return [];
  }
  if (resourceKind !== undefined) return undefined;
  return valueType !== undefined && arrayValueTypes.has(valueType) ? [] : undefined;
};

/**
 * 解析模板输入的非用户初始值。用户显式覆盖由 Command 在实例化后应用，
 * 因而 `[]`、空字符串、false 和 0 都不会被默认值覆盖。
 */
export const resolveInitialInputValue = ({
  input,
  meta,
  validatedRemoteDefault
}: {
  input: FlowNodeInputItemType;
  meta?: NodeInputAutomationMeta;
  validatedRemoteDefault?: { provided: true; value: unknown };
}): unknown => {
  const defaultPolicy = meta?.defaultPolicy ?? 'template';
  const acceptsRemoteDefault = defaultPolicy !== 'userRequired' && meta?.resourceKind !== 'secret';

  if (acceptsRemoteDefault && validatedRemoteDefault?.provided === true) {
    return cloneValue(validatedRemoteDefault.value);
  }

  // 资源 ID 必须由远端 Provider 验证；原始模板里的资源值不能直接成为本地绑定。
  if (defaultPolicy === 'template' && meta?.resourceKind === undefined) {
    const templateDefault = input.defaultValue ?? input.value;
    if (templateDefault !== undefined) return cloneValue(templateDefault);
  }

  return getResourceSafeEmptyValue({
    valueType: input.valueType,
    resourceKind: meta?.resourceKind
  });
};

/** 判断模板/远端初始值是否会阻止后置的 Start 默认引用。 */
export const hasConfiguredValue = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};
