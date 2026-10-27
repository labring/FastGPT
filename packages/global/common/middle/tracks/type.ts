import type { TrackEnum } from './constants';
import { z } from 'zod';

export const WorkflowBuilderTrackDataSchema = z.object({
  appId: z.string(),
  action: z.enum([
    'entry_click',
    'message_submit',
    'preview_shown',
    'preview_confirm',
    'preview_revise',
    'preview_cancel',
    'result_ready',
    'apply_click',
    'apply_failed'
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
