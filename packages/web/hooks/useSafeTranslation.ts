import { useTranslation as useNextTranslation } from 'next-i18next';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { I18N_NAMESPACES_MAP } from '../i18n/constants';

export type SafeTranslation<T extends TFunction> = T & ((key: string, ...args: any[]) => string);

/**
 * 为 i18next 翻译函数增加动态 key 兜底：未知 namespace 或空 key 原样返回，避免业务数据中的
 * 未注册翻译 key 触发异常或渲染为空字符串。
 */
export const createSafeTranslation = <T extends TFunction>(originalT: T): SafeTranslation<T> => {
  const t = (key: any, ...args: any[]): string => {
    if (key === null || key === undefined) return '';
    if (typeof key !== 'string') return String(key);
    if (!key) return '';

    const ns = key.split(':')[0];
    if (!I18N_NAMESPACES_MAP[ns as any]) {
      return key;
    }

    // @ts-ignore
    return originalT(key, ...args);
  };

  return t as SafeTranslation<T>;
};

export function useSafeTranslation() {
  const { t: originalT, ...rest } = useNextTranslation();
  const t = useMemo(() => createSafeTranslation<typeof originalT>(originalT), [originalT]);

  return {
    t,
    ...rest
  };
}
