import type { AppLogKeysEnum } from './constants';

export type AppLogKeysSchemaType = {
  teamId: string;
  appId: string;
  logKeys: { key: AppLogKeysEnum; enable: boolean }[];
};
