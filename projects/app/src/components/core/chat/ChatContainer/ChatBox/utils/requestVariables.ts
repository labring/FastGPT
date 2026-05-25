import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';

/**
 * 将变量表单值转换为发送聊天请求时的 variables。
 *
 * 输入输出约定：
 * - `variableList` 是唯一可信的变量声明来源，返回值只包含声明过的 key。
 * - `variables` 是 react-hook-form 收集到的用户输入，可能包含空值或额外字段。
 * - 空字符串、null、undefined 统一回退到变量配置里的 `defaultValue`。
 * - 返回值会按变量的 `valueType` 走 `valueTypeFormat`，与 workflow runtime 期望的
 *   string/number/boolean/object/array 类型对齐。
 *
 * 时间变量的特殊处理：
 * - timePointSelect 和 timeRangeSelect 在表单层可能是 Date 可解析值。
 * - 发给 workflow 前要先转成 `YYYY-MM-DD HH:mm:ss` 字符串，再做 valueType 格式化。
 * - timeRangeSelect 中的空字符串保留为空字符串，用于表达未选择的边界。
 */
export const formatChatRequestVariables = ({
  variableList,
  variables = {}
}: {
  variableList?: VariableItemType[];
  variables?: Record<string, any>;
}) => {
  const requestVariables: Record<string, any> = {};

  variableList?.forEach((item) => {
    // 只处理变量配置声明过的 key；未声明字段不会进入 requestVariables。
    let val =
      variables[item.key] === '' ||
      variables[item.key] === undefined ||
      variables[item.key] === null
        ? item.defaultValue
        : variables[item.key];

    // 时间变量先统一成 workflow 可直接消费的本地时间字符串。
    if (item.type === VariableInputEnum.timePointSelect && val) {
      val = formatTime2YMDHMS(new Date(val));
    } else if (item.type === VariableInputEnum.timeRangeSelect && val) {
      val = val.map((item: string) => (item ? formatTime2YMDHMS(new Date(item)) : ''));
    }

    // 最后按 valueType 收敛类型，避免表单字符串直接进入 workflow runtime。
    requestVariables[item.key] = valueTypeFormat(val, item.valueType);
  });

  return requestVariables;
};
