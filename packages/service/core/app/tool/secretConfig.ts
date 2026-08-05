import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { encryptSecretValue, storeSecretValue } from '../../../common/secret/utils';

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
