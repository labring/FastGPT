import { useRouter } from 'next/router';
import { useEffect } from 'react';

export type UseRequiredQueryParamOptions = {
  /** 缺少参数时的重定向目标路由 */
  fallbackRoute?: string;
};

/**
 * 校验 app 的 CSR 详情页必填参数；调用方由 AppShell 的路由门禁保障首次 query 已就绪。
 * 数组参数取首项，缺失或为空时返回空字符串，并在配置了 fallbackRoute 时重定向。
 * 只处理参数有效性，不承担 SSR 页面的 hydration 等待。
 */
export function useRequiredQueryParam<T extends string = string>(
  key: string,
  options?: UseRequiredQueryParamOptions
) {
  const router = useRouter();
  const rawValue = router.query[key];
  const value = (Array.isArray(rawValue) ? rawValue[0] : rawValue) as T | undefined;

  useEffect(() => {
    if (!value && options?.fallbackRoute) {
      void router.replace(options.fallbackRoute);
    }
  }, [value, options?.fallbackRoute, router]);

  return {
    value: (value ?? '') as T,
    query: router.query
  };
}
