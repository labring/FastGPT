import type { TrackEnum } from './constants';
import { z } from 'zod';

/** 完整的服务端采集参数；落库时 teamId 提取到顶层，其余字段存入 data。 */
export const WorkflowBuilderTrackDataSchema = z.object({
  teamId: z.string(),
  appId: z.string(),
  chatId: z.string(),
  action: z.enum([
    'message_accepted',
    'preview_generated',
    'preview_confirm',
    'preview_revise',
    'preview_cancel',
    'result_ready',
    'apply_requested',
    'apply_failed',
    'apply_succeeded'
  ])
});
export type WorkflowBuilderTrackData = z.infer<typeof WorkflowBuilderTrackDataSchema>;

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
