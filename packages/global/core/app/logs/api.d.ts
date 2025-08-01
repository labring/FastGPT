import type { AppChatLogAppData, AppChatLogChatData, AppChatLogUserData } from './type';

export type getChartDataQuery = {};

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

export type getTotalDataBody = {};

export type getTotalDataResponse = {
  totalUsers: number;
  totalChat: number;
  totalPoints: number;
};
