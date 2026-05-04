import { marketplaceEnv } from '@/env';

const S3Prefix = marketplaceEnv.S3_PREFIX;

export const getPkgdownloadURL = (toolId: string) => {
  return S3Prefix + '/pkgs/' + toolId + '.pkg';
};

export const getReadmeURL = (toolId: string) => {
  return `${S3Prefix}/system/plugin/tools/${toolId}/README.md`;
};
