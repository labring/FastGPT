import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useSystemStore } from './useSystemStore';

/** Resolve a documentation URL with canonical locale prefixing on official FastGPT doc hosts. */
export const getDocPath = (path: string) => {
  const feConfigs = useSystemStore.getState().feConfigs;

  if (!feConfigs?.docUrl) return '';
  if (!path.startsWith('/')) return path;
  if (feConfigs.docUrl.endsWith('/')) return feConfigs.docUrl.slice(0, -1);

  const localizedPath = (() => {
    if (/^\/(?:zh-CN|en|deploy|examples)(?:\/|$)/.test(path)) return path;
    if (feConfigs.docUrl.includes('doc.fastgpt.cn')) return `/zh-CN${path}`;
    if (feConfigs.docUrl.includes('doc.fastgpt.io')) return `/en${path}`;
    return path;
  })();

  return getWebReqUrl(feConfigs.docUrl + localizedPath);
};
