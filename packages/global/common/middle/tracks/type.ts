import type { TrackEnum } from './constants';
import { OAuthEnum } from '../../../support/user/constant';
import { AppTypeEnum } from '../../../core/app/constants';

export type PushTrackCommonType = {
  uid: string;
  teamId: string;
  tmbId: string;
};

export type TrackSchemaType = {
  event: TrackEnum;
  createTime: Date;
  uid?: string;
  teamId?: string;
  tmbId?: string;
  data: Record<string, any>;
};
