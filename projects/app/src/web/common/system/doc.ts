import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useSystemStore } from './useSystemStore';
export const getDocPath = (path: string) => {
  const feConfigs = useSystemStore.getState().feConfigs;

  if (!feConfigs?.docUrl) return '';
  if (!path.startsWith('/')) return path;
  if (feConfigs.docUrl.endsWith('/')) return feConfigs.docUrl.slice(0, -1);

  return getWebReqUrl(feConfigs.docUrl + path);
};
