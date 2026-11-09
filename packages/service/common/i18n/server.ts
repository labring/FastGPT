import { createInstance, type i18n, type ResourceLanguage } from 'i18next';
import type { localeType } from '@fastgpt/global/common/i18n/type';

type ServerTranslatorRuntime = {
  instance: i18n;
  resourceLoads: Map<string, Promise<void>>;
};

// 同一份模块级资源加载器复用运行时；不同应用或测试的资源来源相互隔离。
const translatorRuntimes = new WeakMap<object, Promise<ServerTranslatorRuntime>>();

/**
 * 按需加载当前语言及英文资源，返回固定请求语言的翻译函数，缺失文案回退英文或原 key。
 * 调用方应复用模块级 resourceLoaders：实例及语言/命名空间加载 Promise 在进程内缓存，失败可重试。
 * 资源由调用方提供，Service 不依赖 Web；不切换共享实例语言，保留插值原文。
 */
export const createServerTranslator = async <Namespace extends string>({
  locale,
  namespaces,
  resourceLoaders
}: {
  locale: localeType;
  namespaces: readonly (NoInfer<Namespace> | 'common')[];
  resourceLoaders: Record<
    localeType,
    Record<Namespace | 'common', () => Promise<{ default: ResourceLanguage }>>
  >;
}) => {
  // 1. 缓存初始化 Promise，并发首请求只创建一个实例；初始化失败不永久污染缓存。
  let runtime = translatorRuntimes.get(resourceLoaders);
  if (!runtime) {
    runtime = (async (): Promise<ServerTranslatorRuntime> => {
      const instance = createInstance();
      await instance.init({
        lng: 'en',
        fallbackLng: 'en',
        ns: [],
        defaultNS: 'common',
        resources: {},
        keySeparator: false,
        // 显式声明命名空间分隔符，避免带空格的 key 被识别为自然语言而跳过命名空间解析。
        nsSeparator: ':',
        interpolation: { escapeValue: false }
      });
      return { instance, resourceLoads: new Map() };
    })().catch((error) => {
      translatorRuntimes.delete(resourceLoaders);
      throw error;
    });
    translatorRuntimes.set(resourceLoaders, runtime);
  }
  const { instance, resourceLoads } = await runtime;

  /** 同一资源的并发请求等待同一个 Promise，失败仅清理该资源，保留其他已加载内容。 */
  const loadResource = (language: localeType, namespace: Namespace | 'common') => {
    const key = `${language}:${namespace}`;
    let loading = resourceLoads.get(key);
    if (!loading) {
      // 先登记 Promise，再执行加载器，同时兼容同步抛错与异步拒绝。
      loading = Promise.resolve()
        .then(async () => {
          const { default: resource } = await resourceLoaders[language][namespace]();
          instance.addResourceBundle(language, namespace, resource);
        })
        .catch((error) => {
          resourceLoads.delete(key);
          throw error;
        });
      resourceLoads.set(key, loading);
    }
    return loading;
  };

  // 2. 只补齐本次所需资源；common 为不带命名空间的 key 提供默认查找范围。
  const requiredNamespaces = [...new Set(['common', ...namespaces] as const)];
  await Promise.all(
    [...new Set([locale, 'en'] as const)].flatMap((language) =>
      requiredNamespaces.map((namespace) => loadResource(language, namespace))
    )
  );

  // 3. 固定每个请求的语言，避免共享实例 changeLanguage 导致并发串语言。
  const fixedT = instance.getFixedT(locale, 'common');
  const t = (key: string, options?: Record<string, unknown>): string =>
    fixedT(key, { defaultValue: key, ...options });

  return { t };
};
