import { team_root } from './team';
import { app_root_root } from './testApp';
import { tmb_root_root } from './tmb';

export type TestOutLinkSchema = {
  _id: string;
  shareId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  name: string;
  // usagePoints: number;
  // lastTime: Date;
  // type: PublishChannelEnum;

  // whether the response content is detailed
  // responseDetail: boolean;
  //
  // // response when request
  // immediateResponse?: string;
  // // response when error or other situation
  // defaultResponse?: string;

  // limit?: {
  //   expiredTime?: Date;
  //   // Questions per minute
  //   QPM: number;
  //   maxUsagePoints: number;
  //   // Verification message hook url
  //   hookUrl?: string;
  // };
  app?: any;
};

export const outlink_root_1: TestOutLinkSchema = {
  _id: 'outlink_root_1',
  shareId: 'outlink_root_1_shareId',
  teamId: team_root.ownerId,
  tmbId: tmb_root_root._id,
  appId: app_root_root._id,
  name: 'test-name'
};

export const outlink_root_2: TestOutLinkSchema = {
  _id: 'outlink_root_2',
  shareId: 'outlink_root_2_shareId',
  teamId: team_root.ownerId,
  tmbId: tmb_root_root._id,
  appId: app_root_root._id,
  name: 'test-name-2'
};

export const TestOutLinkList: TestOutLinkSchema[] = [outlink_root_1, outlink_root_2];
