import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useSystemStore } from './useSystemStore';

const OFFICIAL_DOC_HOST_LOCALES: Record<string, 'zh-CN' | 'en'> = {
  'doc.fastgpt.cn': 'zh-CN',
  'doc.fastgpt.in': 'zh-CN',
  'doc.fastgpt.io': 'en',
  'doc.tryfastgpt.ai': 'en'
};

const CANONICAL_DOC_HOSTS: Record<'zh-CN' | 'en', string> = {
  'zh-CN': 'doc.fastgpt.cn',
  en: 'doc.fastgpt.io'
};

/**
 * Resolve a documentation URL to unprefixed owner hosts on official FastGPT domains while preserving
 * locale prefixes on custom self-hosted documentation instances.
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
    // 1. Parse base URL and detect whether it points to an official FastGPT documentation host.
    const parsedUrl = new URL(docUrl, 'https://fastgpt.local');
    const hasOrigin = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(docUrl);
    const isProtocolRelative = docUrl.startsWith('//');
    const originPrefix = hasOrigin
      ? parsedUrl.origin
      : isProtocolRelative
        ? `//${parsedUrl.host}`
        : '';
    const hostLocale =
      hasOrigin || isProtocolRelative
        ? OFFICIAL_DOC_HOST_LOCALES[parsedUrl.hostname.toLowerCase()]
        : undefined;

    const normalizeDocLocale = (locale: string): 'zh-CN' | 'zh' | 'en' => {
      const lower = locale.toLowerCase();
      if (lower === 'en') return 'en';
      if (lower === 'zh-cn') return 'zh-CN';
      return hostLocale ? 'zh-CN' : 'zh';
    };

    // 2. Strip any trailing locale segment from base pathname so configured locale overrides remain explicit.
    const rawBasePath = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    const baseLocaleMatch = rawBasePath.match(/\/(zh-cn|zh|en)$/i);
    const basePath = baseLocaleMatch
      ? rawBasePath.slice(0, -baseLocaleMatch[0].length)
      : rawBasePath;
    const explicitBaseLocale = baseLocaleMatch ? normalizeDocLocale(baseLocaleMatch[1]) : undefined;

    // 3. Emit direct unprefixed canonical owner URLs for official FastGPT documentation hosts.
    if (hostLocale !== undefined && basePath === '') {
      const buildOfficialOrigin = (locale: 'zh-CN' | 'en') =>
        hasOrigin
          ? `${parsedUrl.protocol}//${CANONICAL_DOC_HOSTS[locale]}`
          : `//${CANONICAL_DOC_HOSTS[locale]}`;

      if (/^\/(?:deploy|examples)(?:\/|$|[?#])/.test(path)) {
        const assetLocale: 'zh-CN' | 'en' = explicitBaseLocale === 'en' ? 'en' : explicitBaseLocale ? 'zh-CN' : hostLocale;
        return getWebReqUrl(`${buildOfficialOrigin(assetLocale)}${path}`);
      }

      const pathLocaleMatch = path.match(/^\/(zh-cn|zh|en)(?=\/|$|[?#])/i);
      const explicitPathLocale: 'zh-CN' | 'en' | undefined = pathLocaleMatch
        ? pathLocaleMatch[1].toLowerCase() === 'en'
          ? 'en'
          : 'zh-CN'
        : undefined;
      const resolvedOfficialBaseLocale: 'zh-CN' | 'en' | undefined =
        explicitBaseLocale === undefined
          ? undefined
          : explicitBaseLocale === 'en'
            ? 'en'
            : 'zh-CN';
      const effectiveLocale = explicitPathLocale ?? resolvedOfficialBaseLocale ?? hostLocale;
      const remainder = pathLocaleMatch ? path.slice(pathLocaleMatch[0].length) : path;
      const cleanPath =
        remainder === '' || remainder.startsWith('?') || remainder.startsWith('#')
          ? `/${remainder}`
          : remainder;

      return getWebReqUrl(`${buildOfficialOrigin(effectiveLocale)}${cleanPath}`);
    }

    const targetLocale = explicitBaseLocale ?? hostLocale;
    const prefix = `${originPrefix}${basePath}`;

    // 4. Preserve localized path segments for custom self-hosted documentation origins.
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
    // 5. Fall back to direct string concatenation when base URL cannot be parsed.
    return getWebReqUrl(`${docUrl}${path}`);
  }
};
