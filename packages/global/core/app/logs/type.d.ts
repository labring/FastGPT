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

export type AppChatLogSchema = {
  _id: string;
  appId: string;
  teamId: string;
  chatId: string;
  userId: string;
  source: string;
  sourceName?: string;
  createTime: Date;
  updateTime: Date;

  chatItemCount: number;
  errorCount: number;
  totalPoints: number;
  goodFeedbackCount: number;
  badFeedbackCount: number;
  totalResponseTime: number;

  isFirstChat: boolean; // whether this is the user's first session in the app
};
