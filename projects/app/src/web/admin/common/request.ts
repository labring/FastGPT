import {
  GET as appGET,
  POST as appPOST,
  PUT as appPUT,
  DELETE as appDELETE
} from '@/web/common/api/request';

/** app 请求实例的 ConfigType（非导出，通过参数类型推断） */
type ConfigType = Parameters<typeof appGET>[2];

/**
 * admin 前端请求封装：复用 app 的 axios 请求实例（baseURL /api、token、错误处理）。
 *
 * UI 通过 /proApi 代理调用 pro/admin 的接口（FastGPTProUrl 配置的服务）。
 * 当 pro 服务未配置或不可达时（开源版部署），对 /proApi 请求静默降级为空数据，
 * 保证管理员页面骨架可正常渲染（不依赖商业版服务）。
 */

/** 识别 /proApi 请求的降级条件：pro 服务未配置（500 + 未配置商业版链接）或 404 */
const silentDegrade404 = (error: unknown) => {
  const isProApiUnavailable =
    typeof error === 'string'
      ? error === 'Not Found' || error.includes('未配置商业版链接')
      : (() => {
          const e = error as {
            response?: { status?: number };
            status?: number;
            code?: number;
            error?: unknown;
            message?: unknown;
            config?: { url?: string };
          };
          const status = e?.response?.status ?? e?.status ?? e?.code;
          const url = e?.config?.url ?? '';
          const isProApi = url.includes('/proApi/') || String(e?.message ?? '').includes('proApi');
          // proApi 代理在未配置 FastGPTProUrl 时返回 500 + 未配置商业版链接；404 视为接口不存在
          const proUnavailable =
            isProApi &&
            (String(e?.error ?? '').includes('未配置商业版链接') ||
              String(e?.message ?? '').includes('未配置商业版链接') ||
              String(e?.error ?? '').includes('ECONNREFUSED'));
          return status === 404 || proUnavailable;
        })();

  if (isProApiUnavailable) {
    console.warn('[admin] pro 服务未配置或接口不可达，静默降级为空数据');
    // 返回对 usePagination（{ total, list }）与统计接口（字段 undefined 可接受）都安全的结构
    return { total: 0, list: [] } as never;
  }
  throw error;
};

export const GET = <T = undefined>(url: string, params = {}, config?: ConfigType): Promise<T> =>
  appGET<T>(url, params, config).catch(silentDegrade404);

export const POST = <T = undefined>(url: string, data = {}, config?: ConfigType): Promise<T> =>
  appPOST<T>(url, data, config).catch(silentDegrade404);

export const PUT = <T = undefined>(url: string, data = {}, config?: ConfigType): Promise<T> =>
  appPUT<T>(url, data, config).catch(silentDegrade404);

export const DELETE = <T = undefined>(url: string, data = {}, config?: ConfigType): Promise<T> =>
  appDELETE<T>(url, data, config).catch(silentDegrade404);
