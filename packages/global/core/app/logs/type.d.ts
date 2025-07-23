import type { LogKeysEnum } from './constants';

export type LogKeysSchemaType = {
  teamId: string;
  appId: string;
  logKeys: { key: LogKeysEnum; enable: boolean }[];
};
