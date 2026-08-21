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

/** 构造跨 source 隔离的节点 memory key，避免 App 与 Skill Edit 共用 sourceId 时串数据。 */
export const getWorkflowSourceNodeKey = ({
  runningAppInfo,
  nodeId
}: {
  runningAppInfo: RunningAppInfo;
  nodeId: string;
}) => `${runningAppInfo.sourceType}:${runningAppInfo.sourceId}:${nodeId}`;
