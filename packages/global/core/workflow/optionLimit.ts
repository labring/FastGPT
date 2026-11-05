import { VariableInputEnum } from './constants';
import { FlowNodeInputTypeEnum } from './node/constant';

/** 单选与多选候选项个数、以及用户多选已选个数的最大上限 */
export const MAX_SELECT_OPTION_COUNT = 200;

/** 单个候选项及用户已选选项值的最大字符长度上限 */
export const MAX_SELECT_OPTION_LENGTH = 100;

export type SelectInputType =
  | VariableInputEnum.select
  | VariableInputEnum.multipleSelect
  | FlowNodeInputTypeEnum.select
  | FlowNodeInputTypeEnum.multipleSelect;

/** 判断变量或节点输入类型是否为单选或多选 */
export const isSelectInputType = (type: unknown): type is SelectInputType =>
  type === VariableInputEnum.select ||
  type === VariableInputEnum.multipleSelect ||
  type === FlowNodeInputTypeEnum.select ||
  type === FlowNodeInputTypeEnum.multipleSelect;

/**
 * 将单个选项文本按最大长度（默认 100）截断。
 *
 * 与前端 `<Input maxLength={100} />` 保持相同的 UTF-16 码元计数口径；
 * 当截断边界恰好落在代理对（Surrogate Pair，如 Emoji）的高代理项上时，
 * 自动回退 1 个码元，避免产生孤立代理项乱码或导致 JSON/数据库序列化失败。
 */
export const truncateSelectOptionText = (
  value: string,
  maxLength = MAX_SELECT_OPTION_LENGTH
): string => {
  const limit = Math.max(0, Math.floor(maxLength));
  if (value.length <= limit) return value;
  if (limit === 0) return '';

  const lastCode = value.charCodeAt(limit - 1);
  // 0xD800 - 0xDBFF 为 UTF-16 高代理项，单独保留末尾高代理项会产生非法 Unicode 字符
  const end = lastCode >= 0xd800 && lastCode <= 0xdbff ? limit - 1 : limit;
  return value.slice(0, end);
};

/**
 * 归一化选择项列表：先限制选项个数上限（200），再将每项的 value/label 截断至最大长度（100），
 * 并在 label 缺省时回退到截断后的 value。
 */
export const normalizeSelectOptionList = <
  T extends {
    value: string;
    label?: string;
  }
>(
  list: T[]
): (Omit<T, 'label' | 'value'> & { label: string; value: string })[] =>
  list.slice(0, MAX_SELECT_OPTION_COUNT).map((item) => {
    const value = truncateSelectOptionText(item.value);
    return {
      ...item,
      value,
      label:
        item.label !== undefined && item.label !== null
          ? truncateSelectOptionText(item.label)
          : value
    };
  });

/**
 * 按控件类型归一化单选或多选值（用于 defaultValue 及运行期入参/交互提交值）：
 * - 单选（select）：若值为字符串，截断至 100 字符；
 * - 多选（multipleSelect）：若值为数组，先截取前 200 项，再将每个字符串元素截断至 100 字符；
 * - 其他类型：原样返回。
 */
export const normalizeSelectValue = ({
  value,
  type
}: {
  value: unknown;
  type: unknown;
}): unknown => {
  if (type === VariableInputEnum.multipleSelect || type === FlowNodeInputTypeEnum.multipleSelect) {
    if (!Array.isArray(value)) return value;
    return value
      .slice(0, MAX_SELECT_OPTION_COUNT)
      .map((item) => (typeof item === 'string' ? truncateSelectOptionText(item) : item));
  }

  if (type === VariableInputEnum.select || type === FlowNodeInputTypeEnum.select) {
    return typeof value === 'string' ? truncateSelectOptionText(value) : value;
  }

  return value;
};
