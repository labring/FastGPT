import { isObjectId } from '@fastgpt/global/common/string/utils';

export type AdminSearchOption<TField extends string = string> = {
  value: TField;
  label: string;
  placeholder?: string;
  exactObjectId?: boolean;
};

/**
 * 校验并归一化当前搜索输入。
 * 精确 ID 字段非空时必须为合法 24 位十六进制 ObjectId，否则阻止发送请求并标记为无效输入。
 */
export const evaluateAdminSearchInput = <TField extends string>({
  field,
  value,
  options
}: {
  field: TField;
  value: string;
  options: readonly AdminSearchOption<TField>[];
}): {
  shouldFetch: boolean;
  isInvalid: boolean;
  params: Partial<Record<TField, string>>;
} => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return {
      shouldFetch: true,
      isInvalid: false,
      params: {}
    };
  }

  const activeOption = options.find((item) => item.value === field);
  if (activeOption?.exactObjectId && !isObjectId(trimmed)) {
    return {
      shouldFetch: false,
      isInvalid: true,
      params: {}
    };
  }

  return {
    shouldFetch: true,
    isInvalid: false,
    params: { [field]: trimmed } as Partial<Record<TField, string>>
  };
};

/** 判断两次搜索请求参数是否一致，避免切换空维度或重复清空时触发多余查询。 */
export const isSameAdminSearchParams = <TField extends string>(
  prev: Partial<Record<TField, string>>,
  next: Partial<Record<TField, string>>
): boolean => {
  const prevKeys = Object.keys(prev) as TField[];
  const nextKeys = Object.keys(next) as TField[];
  if (prevKeys.length !== nextKeys.length) return false;
  return prevKeys.every((key) => prev[key] === next[key]);
};
