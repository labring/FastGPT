import type { AppLogTimespanEnum } from './constants';
import type { AppChatLogAppData, AppChatLogChatData, AppChatLogUserData } from './type';

export type getChartDataBody = {
  appId: string;
  dateStart: Date;
  dateEnd: Date;
  source?: ChatSourceEnum[];
  offset: number;
  userTimespan: AppLogTimespanEnum;
  chatTimespan: AppLogTimespanEnum;
  appTimespan: AppLogTimespanEnum;
};

export type getChartDataResponse = {
  userData: AppChatLogUserData;
  chatData: AppChatLogChatData;
  appData: AppChatLogAppData;
};

export type getTotalDataQuery = {
  appId: string;
};

export type getTotalDataResponse = {
  totalUsers: number;
  totalChats: number;
  totalPoints: number;
};
