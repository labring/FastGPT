import { TrackEnum } from './constants';
import { z } from 'zod';

/** 服务端链路事件只保存可信身份和事件类型，每次调用对应一条独立记录。 */
export const WorkflowBuilderTrackDataSchema = z.object({
  teamId: z.string(),
  tmbId: z.string(),
  appId: z.string(),
  chatId: z.string(),
  event: z.enum([
    TrackEnum.workflowBuilderMessageAccepted,
    TrackEnum.workflowBuilderPreviewGenerated,
    TrackEnum.workflowBuilderPreviewConfirm,
    TrackEnum.workflowBuilderPreviewRevise,
    TrackEnum.workflowBuilderPreviewCancel,
    TrackEnum.workflowBuilderResultReady,
    TrackEnum.workflowBuilderBuildFailed,
    TrackEnum.workflowBuilderApplyRequested,
    TrackEnum.workflowBuilderApplyFailed,
    TrackEnum.workflowBuilderApplySucceeded
  ])
});
export type WorkflowBuilderTrackData = z.infer<typeof WorkflowBuilderTrackDataSchema>;

/** 团队业务事件通过团队和成员定位。 */
export type PushTrackTeamType = {
  teamId: string;
  tmbId: string;
};

/** 登录、日活事件保留全局用户身份和当前团队成员信息。 */
export type PushTrackUserType = {
  uid: string;
  teamId: string;
  tmbId: string;
};

export type TrackSchemaType = {
  event: TrackEnum;
  createTime: Date;
  /** 仅账号级事件保存全局用户身份，例如登录、日活和账号注销。 */
  uid?: string;
  teamId?: string;
  tmbId?: string;
  data: Record<string, any>;
};
