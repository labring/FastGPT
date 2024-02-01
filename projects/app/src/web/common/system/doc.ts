import { useSystemStore } from './useSystemStore';
export const getDocPath = (path: string) => {
  const feConfigs = useSystemStore.getState().feConfigs;

  if (!feConfigs?.docUrl) return '';
  if (feConfigs.docUrl.endsWith('/')) return feConfigs.docUrl;
  return feConfigs.docUrl + path;
};
