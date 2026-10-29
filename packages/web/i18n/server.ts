import { createInstance } from 'i18next';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { I18nNsType } from './i18next';
import { generatedLoaders } from './resourceLoaders.generated';

/**
 * 为服务端请求创建独立翻译器，按需加载指定命名空间及 common，缺失文案回退英文或原 key。
 * 使用与客户端相同的资源及扁平 key，保留插值原文；不修改全局语言，避免并发请求串语言。
 */
export const createServerTranslator = async ({
  locale,
  namespaces
}: {
  locale: localeType;
  namespaces: readonly I18nNsType[number][];
}) => {
  // 只加载当前请求所需资源；common 为未指定命名空间的 key 提供默认查找范围。
  const requiredNamespaces = [...new Set(['common', ...namespaces] as const)];
  const resources = Object.fromEntries(
    await Promise.all(
      [...new Set([locale, 'en'] as const)].map(async (language) => [
        language,
        Object.fromEntries(
          await Promise.all(
            requiredNamespaces.map(async (namespace) => [
              namespace,
              (await generatedLoaders[language][namespace]()).default
            ])
          )
        )
      ])
    )
  );

  const i18n = createInstance();
  await i18n.init({
    lng: locale,
    fallbackLng: 'en',
    ns: requiredNamespaces,
    defaultNS: 'common',
    resources,
    keySeparator: false,
    interpolation: { escapeValue: false }
  });
  const t = (key: string, options?: Record<string, unknown>): string =>
    i18n.t(key, { defaultValue: key, ...options });

  return { t };
};
