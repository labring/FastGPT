import type { ChatSourceEnum } from '../../core/chat/constants';
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

export type AppChatLogUserData = {
  timestamp: number;
  summary: {
    userCount: number;
    newUserCount: number;
    retentionUserCount: number;
    points: number;
    sourceCountMap: Record<ChatSourceEnum, number>;
  };
}[];

export type AppChatLogChatData = {
  timestamp: number;
  summary: {
    chatItemCount: number;
    chatCount: number;
    errorCount: number;
    points: number;
  };
}[];

export type AppChatLogAppData = {
  timestamp: number;
  summary: {
    goodFeedBackCount: number;
    badFeedBackCount: number;
    chatCount: number;
    totalResponseTime: number;
  };
}[];
