import { useRouter } from 'next/router';
import { useEffect } from 'react';

export type UseRequiredQueryParamOptions = {
  /** 缺少参数时的重定向目标路由 */
  fallbackRoute: string;
};

/**
 * 校验 app 的 CSR 详情页必填参数；调用方由 AppShell 的路由门禁保障首次 query 已就绪。
 * 数组参数取首项，缺失或为空时直接跳转 fallbackRoute，返回 undefined 阻止无效业务挂载。
 * 只处理参数有效性，不承担 SSR 页面的 hydration 等待。
 */
export function useRequiredQueryParam(
  key: string,
  { fallbackRoute }: UseRequiredQueryParamOptions
) {
  const router = useRouter();
  const rawValue = router.query[key];
  const value = (Array.isArray(rawValue) ? rawValue[0] : rawValue) || undefined;

  useEffect(() => {
    if (!value) {
      void router.replace(fallbackRoute);
    }
  }, [value, fallbackRoute, router]);

  return value;
}
