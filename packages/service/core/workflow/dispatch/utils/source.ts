import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatDispatchProps } from '../../types/runtime';

type RunningAppInfo = ChatDispatchProps['runningAppInfo'];

/** 返回 workflow 运行态标准 source identity，禁止再从 runningAppInfo 派生旧 appId 语义。 */
export const getWorkflowSource = ({ sourceType, sourceId }: RunningAppInfo) => ({
  sourceType,
  sourceId
});

/** App 专属链路使用的真实 appId；Skill Edit 没有 App 上下文时返回 undefined。 */
export const getWorkflowAppId = (runningAppInfo: RunningAppInfo) =>
  runningAppInfo.sourceType === ChatSourceTypeEnum.app ? runningAppInfo.sourceId : undefined;
