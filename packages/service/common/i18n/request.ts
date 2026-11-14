import { AsyncLocalStorage } from 'node:async_hooks';
import type { ResourceLanguage } from 'i18next';
import { LangEnum, type localeType } from '@fastgpt/global/common/i18n/type';
import type { NodeHttpRequest, NodeHttpResponse } from '../../types/http';
import { getLocale } from '../middle/i18n';
import type { createServerTranslator } from './server';
import { getLogger, LogCategories } from '../logger';

type RequestTranslator = Awaited<ReturnType<typeof createServerTranslator>>;
type RequestI18nContext = { locale: localeType; translator?: RequestTranslator };
type ResourceLoaders = Record<
  localeType,
  Record<string, () => Promise<{ default: ResourceLanguage }>>
>;

export type ApiI18n = <T>(
  params: { req: Pick<NodeHttpRequest, 'headers'>; res: NodeHttpResponse },
  callback: () => T | Promise<T>
) => Promise<T>;

const requestI18n = new AsyncLocalStorage<RequestI18nContext>();
// 响应对象同时绑定上下文，避免外部 SDK 的事件回调脱离 AsyncLocalStorage 后丢失语言。
const responseI18n = new WeakMap<NodeHttpResponse, RequestI18nContext>();

/** 读取当前 HTTP 请求语言；后台任务没有请求上下文时不向内部服务强加语言。 */
export const getRequestLocale = (): localeType | undefined => requestI18n.getStore()?.locale;

/**
 * 只翻译完整、已存在的 namespace:key，原文、未知 key 和加载失败均原样返回。
 * 优先使用响应绑定的语言，保证异步回调和 SSE 在缓存入队前得到稳定文案。
 */
export const translateApiMessage = (message: string, res?: NodeHttpResponse): string => {
  const context = (res && responseI18n.get(res)) || requestI18n.getStore();
  if (!context?.translator || !/^[A-Za-z][A-Za-z0-9_]*:/.test(message)) return message;

  try {
    return context.translator.exists(message)
      ? context.translator.t(message, { returnEmptyString: false })
      : message;
  } catch {
    // 展示层失败不能覆盖业务异常或中断已开始的流。
    return message;
  }
};

/**
 * 创建应用级 i18n 入口：资源由应用注入，按语言缓存完整翻译函数，不切换共享实例语言。
 * 等待资源后才执行回调，因此 JSON / SSE 写出函数可保持同步；失败只降级本次请求，下次重试。
 */
export const createApiI18n = (resourceLoaders: ResourceLoaders): ApiI18n => {
  const translators = new Map<localeType, Promise<RequestTranslator>>();

  return async ({ req, res }, callback) => {
    const locale = getLocale(req) ?? LangEnum.en;
    const context: RequestI18nContext = { locale };

    let loading = translators.get(locale);
    if (!loading) {
      loading = import('./server')
        .then(({ createServerTranslator }) =>
          createServerTranslator({
            locale,
            namespaces: Object.keys(resourceLoaders[locale]),
            resourceLoaders
          })
        )
        .catch((error) => {
          translators.delete(locale);
          throw error;
        });
      translators.set(locale, loading);
    }

    try {
      context.translator = await loading;
    } catch (error) {
      getLogger(LogCategories.HTTP.ERROR).error('API translation resources failed to load', {
        locale,
        error
      });
    }

    responseI18n.set(res, context);
    return await requestI18n.run(context, callback);
  };
};
