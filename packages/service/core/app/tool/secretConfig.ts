import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType, InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import {
  encryptSecretValue,
  resolveSecretValue,
  storeSecretValue
} from '../../../common/secret/utils';
import type { SecretValueReferenceResolver } from '@fastgpt/global/common/secret/utils';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';

const inputTypeValueTypeMap: Record<InputConfigType['inputType'], WorkflowIOValueTypeEnum> = {
  input: WorkflowIOValueTypeEnum.string,
  numberInput: WorkflowIOValueTypeEnum.number,
  secret: WorkflowIOValueTypeEnum.string,
  switch: WorkflowIOValueTypeEnum.boolean,
  select: WorkflowIOValueTypeEnum.string
};

/** 解析系统工具手工输入中的静态 wrapper/ref，并复用工作流值类型转换。 */
export const resolveToolInputValues = ({
  value,
  inputList,
  resolveReference
}: {
  value?: Record<string, unknown>;
  inputList?: InputConfigType[];
  resolveReference?: SecretValueReferenceResolver;
}) => {
  if (!value) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, rawValue]) => {
      const input = inputList?.find((item) => item.key === key);
      const resolvedValue = resolveSecretValue({ value: rawValue, resolveReference });
      if (!input) return [key, resolvedValue];

      const valueType = inputTypeValueTypeMap[input.inputType];
      if (resolvedValue !== null && typeof resolvedValue === 'object') {
        throw new Error(`System tool input ${key} must resolve to a scalar`);
      }

      return [key, valueTypeFormat(resolvedValue, valueType)];
    })
  );
};

/**
 * 格式化工具输入中的敏感值。
 * 保存和详情读取都经过这里，确保 Agent 嵌套工具与普通工具使用一致的密钥规则。
 */
export const formatToolInputSecrets = ({ inputs }: { inputs: FlowNodeInputItemType[] }) => {
  inputs.forEach((input) => {
    if (
      input.key === NodeInputKeyEnum.systemInputConfig &&
      typeof input.value === 'object' &&
      input.value !== null
    ) {
      if (input.value.type !== SystemToolSecretInputTypeEnum.manual) {
        delete input.value.value;
      } else if (
        input.value.value &&
        typeof input.value.value === 'object' &&
        !Array.isArray(input.value.value)
      ) {
        input.inputList?.forEach((inputItem) => {
          if (inputItem.inputType !== 'secret') return;
          const value = input.value.value?.[inputItem.key];
          input.value.value[inputItem.key] = encryptSecretValue(value);
        });
      }
    }

    if (input.key === NodeInputKeyEnum.headerSecret && typeof input.value === 'object') {
      input.value = storeSecretValue(input.value);
    }

    if (input.renderTypeList?.includes(FlowNodeInputTypeEnum.password)) {
      input.value = encryptSecretValue(input.value);
    }
  });
};
