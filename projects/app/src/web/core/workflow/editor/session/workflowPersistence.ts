import type { UseToastOptions } from '@chakra-ui/react';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'next-i18next';
import type { StoreWorkflow } from '@fastgpt/global/common/workflow/editor/protocol';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { serializeRuntime } from '../codec';
import { ensureModelCatalog } from '@/web/core/ai/model/modelData';
import { getWorkflowModelCheckData } from '@/web/core/workflow/modelData';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/check/check';
import { getWorkflowSandboxCheckData } from '@/web/core/workflow/sandbox';
import {
  collectWorkflowErrorIssues,
  renderWorkflowIssueMessage
} from '@/web/core/workflow/issueView';

type WorkflowRuntimeRef = MutableRefObject<WorkflowRuntimePort | null>;
type PendingSaveRevisionRef = MutableRefObject<number | undefined>;

export type WorkflowSaveRequest = {
  runtime: WorkflowRuntimePort;
  sessionId: string;
  appId: string;
  contentRevision: number;
  requestToken: number;
  data: StoreWorkflow;
};

type WorkflowSaveRequestInput = Omit<WorkflowSaveRequest, 'requestToken'>;
type WorkflowSaveRequestScope = {
  runtime: WorkflowRuntimePort | null;
  sessionId: string;
  appId: string;
};

type WorkflowPersistenceArgs = {
  runtimeRef: WorkflowRuntimeRef;
  pendingSaveRevisionRef: PendingSaveRevisionRef;
};

/** 只接受当前 Session、Runtime、应用与请求 token 的保存响应。 */
export const createWorkflowSaveCoordinator = () => {
  let requestToken = 0;
  let activeRequest: WorkflowSaveRequest | undefined;

  return {
    begin: (input: WorkflowSaveRequestInput): WorkflowSaveRequest => {
      const request = {
        ...input,
        requestToken: ++requestToken
      };
      activeRequest = request;
      return request;
    },
    invalidate: () => {
      requestToken += 1;
      activeRequest = undefined;
    },
    isCurrent: (request: WorkflowSaveRequest, scope: WorkflowSaveRequestScope) =>
      activeRequest === request &&
      request.requestToken === requestToken &&
      scope.runtime === request.runtime &&
      scope.sessionId === request.sessionId &&
      scope.appId === request.appId &&
      !request.runtime.isDisposed()
  };
};

/** 序列化当前 Runtime，并记住本次请求对应的内容版本供保存成功后回填。 */
export const serializeWorkflowData = ({
  runtimeRef,
  pendingSaveRevisionRef
}: WorkflowPersistenceArgs): StoreWorkflow | undefined => {
  const current = runtimeRef.current;
  if (!current || current.isDisposed()) return undefined;
  pendingSaveRevisionRef.current = current.getSavepoint().contentRevision;
  return serializeRuntime(current);
};

/**
 * 发布校验 gate：Core 完整检查结构、IO、模型和绑定，Runtime 补充编辑期引用与资源问题。
 * 模型权限按应用基线回查；异步检查期间文档或 Session 变化时丢弃结果，避免放行未检查的数据。
 * 普通保存和调试直接使用 serializeWorkflowData；校验失败只写焦点与提示，不返回不完整文档。
 * hideTip 只抑制提示和焦点定位。
 */
export const serializeWorkflowAndCheckData = async ({
  runtimeRef,
  pendingSaveRevisionRef,
  hideTip = false,
  toast,
  t,
  appId,
  focusIssueNode
}: WorkflowPersistenceArgs & {
  hideTip?: boolean;
  toast: (options?: UseToastOptions) => void;
  t: TFunction;
  appId?: string;
  focusIssueNode: (nodeId?: string) => void;
}): Promise<StoreWorkflow | undefined> => {
  const current = runtimeRef.current;
  if (!current || current.isDisposed()) return undefined;

  const catalog = await ensureModelCatalog().catch(() => undefined);
  if (current.isDisposed() || runtimeRef.current !== current) return undefined;
  if (!catalog) {
    if (!hideTip) toast({ status: 'error', title: 'common:model_catalog_load_failed' });
    return undefined;
  }

  const contentRevision = current.getSavepoint().contentRevision;
  // 校验原始编辑快照，防止保存时的输入归一化掩盖非法 IO。
  const snapshot = current.getWorkflowData();
  const modelData = await getWorkflowModelCheckData({
    nodes: snapshot.nodes,
    chatConfig: snapshot.chatConfig,
    appId
  }).catch(() => undefined);
  if (
    current.isDisposed() ||
    runtimeRef.current !== current ||
    current.getSavepoint().contentRevision !== contentRevision
  )
    return undefined;
  if (!modelData) {
    if (!hideTip) toast({ status: 'error', title: 'common:model_catalog_load_failed' });
    return undefined;
  }

  const checked = checkWorkflowBeforeRunOrPublish({
    nodes: snapshot.nodes.map((node) => ({
      id: node.nodeId,
      position: node.position ?? { x: 0, y: 0 },
      data: { ...node, id: node.nodeId }
    })),
    edges: snapshot.edges,
    chatConfig: snapshot.chatConfig,
    modelData,
    sandbox: getWorkflowSandboxCheckData(),
    t
  });

  // Core 使用完整模型权限和默认值语义，Runtime 的个人目录摘要只服务编辑期提示。
  const errors = collectWorkflowErrorIssues(current).filter(
    (issue) =>
      !['model_required', 'model_unavailable', 'model_unavailable_short'].includes(issue.code)
  );
  if (!checked.hasError && errors.length === 0) {
    focusIssueNode(undefined);
    pendingSaveRevisionRef.current = contentRevision;
    return serializeRuntime(current);
  }

  if (!hideTip) {
    const firstErrorNodeId = snapshot.nodes.find(
      (node) =>
        checked.errorNodeIds.includes(node.nodeId) ||
        errors.some((issue) => 'nodeId' in issue && issue.nodeId === node.nodeId)
    )?.nodeId;
    if (firstErrorNodeId) focusIssueNode(firstErrorNodeId);
    toast({
      status: 'warning',
      title: 'common:core.workflow.Check Failed',
      description: [
        ...new Set([
          ...checked.errorMessages,
          ...errors.map((issue) => renderWorkflowIssueMessage(issue, t))
        ])
      ].join('\n')
    });
  }
  return undefined;
};
