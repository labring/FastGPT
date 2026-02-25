import type { LogLevelEnum } from './constant';
import { LogSignEnum } from './constant';

export type SystemLogType = {
  _id: string;
  text: string;
  level: LogLevelEnum;
  time: Date;
  metadata?: Record<string, any>;
};
