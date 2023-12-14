import { feConfigs } from './staticData';

export const getDocPath = (path: string) => {
  if (!feConfigs?.docUrl) return '';
  if (feConfigs.docUrl.endsWith('/')) return feConfigs.docUrl;
  return feConfigs.docUrl + path;
};
