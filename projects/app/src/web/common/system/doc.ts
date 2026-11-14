import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useSystemStore } from './useSystemStore';

const OFFICIAL_DOC_HOST_LOCALES: Record<string, 'zh-CN' | 'en'> = {
  'doc.fastgpt.cn': 'zh-CN',
  'doc.fastgpt.in': 'zh-CN',
  'doc.fastgpt.io': 'en',
  'doc.tryfastgpt.ai': 'en'
};

/**
 * Resolve a documentation URL with canonical locale prefixing without duplicating base or path locales.
 * Locale priority: explicit locale in `path` → explicit locale at the end of `docUrl` → official host default.
 * `/deploy` and `/examples` are downloadable assets and keep their unprefixed path.
 * Unparsable base URLs fall back to plain concatenation for backward compatibility.
 */
export const getDocPath = (path: string) => {
  const feConfigs = useSystemStore.getState().feConfigs;

  if (!feConfigs?.docUrl) return '';
  if (!path.startsWith('/')) return path;
  if (feConfigs.docUrl.endsWith('/')) return feConfigs.docUrl.slice(0, -1);

  const docUrl = feConfigs.docUrl;
  try {
    // 1. 解析基址：区分绝对地址、协议相对地址和站内相对地址，只有带主机的基址才使用官方域名默认语言
    const parsedUrl = new URL(docUrl, 'https://fastgpt.local');
    const hasOrigin = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(docUrl);
    const originPrefix = hasOrigin
      ? parsedUrl.origin
      : docUrl.startsWith('//')
        ? `//${parsedUrl.host}`
        : '';
    const hostLocale =
      hasOrigin || docUrl.startsWith('//')
        ? OFFICIAL_DOC_HOST_LOCALES[parsedUrl.hostname.toLowerCase()]
        : undefined;

    const normalizeDocLocale = (locale: string): 'zh-CN' | 'zh' | 'en' => {
      const lower = locale.toLowerCase();
      if (lower === 'en') return 'en';
      if (lower === 'zh-cn') return 'zh-CN';
      return hostLocale ? 'zh-CN' : 'zh';
    };

    // 2. 剥离基址末尾的语言段，避免与目标语言重复；运营方显式配置的基址语言优先于域名默认语言
    const rawBasePath = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    const baseLocaleMatch = rawBasePath.match(/\/(zh-cn|zh|en)$/i);
    const basePath = baseLocaleMatch
      ? rawBasePath.slice(0, -baseLocaleMatch[0].length)
      : rawBasePath;
    const explicitBaseLocale = baseLocaleMatch ? normalizeDocLocale(baseLocaleMatch[1]) : undefined;
    const targetLocale = explicitBaseLocale ?? hostLocale;
    const prefix = `${originPrefix}${basePath}`;

    // 3. 拼接路径：下载资源不加语言前缀；调用方 path 自带语言时只做规范化，其余使用目标语言
    const localizedPath = (() => {
      if (/^\/(?:deploy|examples)(?:\/|$|[?#])/.test(path)) return path;

      const pathLocaleMatch = path.match(/^\/(zh-cn|zh|en)(?=\/|$|[?#])/i);
      if (pathLocaleMatch) {
        const normalizedLocale = normalizeDocLocale(pathLocaleMatch[1]);
        return `/${normalizedLocale}${path.slice(pathLocaleMatch[0].length)}`;
      }

      return targetLocale ? `/${targetLocale}${path}` : path;
    })();

    return getWebReqUrl(`${prefix}${localizedPath}`);
  } catch {
    // 4. 基址无法解析时保留旧版直接拼接行为
    return getWebReqUrl(`${docUrl}${path}`);
  }
};
