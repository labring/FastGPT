import type { AppLogKeysEnum } from './constants';

export type AppLogKeysType = {
  key: AppLogKeysEnum;
  enable: boolean;
};

export type AppLogKeysSchemaType = {
  teamId: string;
  appId: string;
  logKeys: AppLogKeysType[];
};
