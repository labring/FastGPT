import { useRouter } from 'next/router';
import { useEffect } from 'react';

export type UseRequiredQueryParamOptions = {
  /** 缺少参数时的重定向目标路由 */
  fallbackRoute?: string;
};

/**
 * CSR 页面安全读取必填 Query 参数的守卫 Hook：
 * 1. 在 router.isReady 且参数缺失时，自动平稳重定向到 fallbackRoute。
 * 2. 只有在 router.isReady 且参数非空时，isReady 才为 true 并返回参数值。
 */
export function useRequiredQueryParam<T extends string = string>(
  key: string,
  options?: UseRequiredQueryParamOptions
) {
  const router = useRouter();
  const rawValue = router.query[key];
  const value = (Array.isArray(rawValue) ? rawValue[0] : rawValue) as T | undefined;
  const isReady = router.isReady && !!value;

  useEffect(() => {
    if (router.isReady && !value && options?.fallbackRoute) {
      router.replace(options.fallbackRoute);
    }
  }, [router.isReady, value, options?.fallbackRoute, router]);

  return {
    isReady,
    value: (value || '') as T,
    query: router.query
  };
}
