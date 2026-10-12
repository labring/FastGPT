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

/** 请求层错误可能是字符串，也可能是普通对象（响应体 / axios 错误）；这里只收窄形状，字段逐个判型 */
type ApiErrorShape = {
  message?: unknown;
  error?: unknown;
  status?: number;
  code?: number;
  response?: { status?: number; data?: { message?: unknown } };
  config?: { url?: string };
};
const isApiErrorShape = (value: unknown): value is ApiErrorShape =>
  typeof value === 'object' && value !== null;

/**
 * 识别 /proApi 请求的降级条件：
 * - 代理未配置商业版服务：错误体为 `{ code: 500, message: '未配置商业版链接: ...' }`；该文案仅由 app 的
 *   /api/proApi 代理产生，且错误体上没有 config/url，只能按文案判定
 * - 商业版服务未启动：ECONNREFUSED，按请求地址确认是 /proApi，避免吞掉其它服务的连接错误
 * - 接口在商业版中不存在：404
 */
const silentDegrade404 = (error: unknown) => {
  const detail = isApiErrorShape(error) ? error : undefined;
  const text = [
    typeof error === 'string' ? error : undefined,
    typeof detail?.message === 'string' ? detail.message : undefined,
    typeof detail?.error === 'string' ? detail.error : undefined,
    typeof detail?.response?.data?.message === 'string' ? detail.response.data.message : undefined
  ]
    .filter((item): item is string => Boolean(item))
    .join(' ');

  const status = detail?.response?.status ?? detail?.status ?? detail?.code;
  const url = detail?.config?.url ?? '';

  const proUnavailable =
    text.includes('未配置商业版链接') ||
    (url.includes('/proApi/') && text.includes('ECONNREFUSED'));

  if (status === 404 || error === 'Not Found' || proUnavailable) {
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
