import { useSystemStore } from './useSystemStore';
export const getDocPath = (path: string) => {
  const feConfigs = useSystemStore.getState().feConfigs;

  if (!feConfigs?.docUrl) return '';
  if (feConfigs.docUrl.endsWith('/')) return feConfigs.docUrl.slice(0, -1);
  return feConfigs.docUrl + path;
};
