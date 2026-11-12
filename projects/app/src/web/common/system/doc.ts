import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useSystemStore } from './useSystemStore';

const OFFICIAL_DOC_HOST_LOCALES: Record<string, 'zh-CN' | 'en'> = {
  'doc.fastgpt.cn': 'zh-CN',
  'doc.fastgpt.in': 'zh-CN',
  'doc.fastgpt.io': 'en',
  'doc.tryfastgpt.ai': 'en'
};

/** Resolve a documentation URL with canonical locale prefixing without duplicating base or path locales. */
export const getDocPath = (path: string) => {
  const feConfigs = useSystemStore.getState().feConfigs;

  if (!feConfigs?.docUrl) return '';
  if (!path.startsWith('/')) return path;
  if (feConfigs.docUrl.endsWith('/')) return feConfigs.docUrl.slice(0, -1);

  const docUrl = feConfigs.docUrl;
  try {
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

    const rawBasePath = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    const baseLocaleMatch = rawBasePath.match(/\/(zh-cn|zh|en)$/i);
    const basePath = baseLocaleMatch
      ? rawBasePath.slice(0, -baseLocaleMatch[0].length)
      : rawBasePath;
    const explicitBaseLocale = baseLocaleMatch ? normalizeDocLocale(baseLocaleMatch[1]) : undefined;
    const targetLocale = hostLocale ?? explicitBaseLocale;
    const prefix = `${originPrefix}${basePath}`;

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
    return getWebReqUrl(`${docUrl}${path}`);
  }
};
