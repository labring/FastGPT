import type { UseToastOptions } from '@chakra-ui/react';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'next-i18next';
import type { StoreWorkflow } from '@fastgpt/global/common/workflow/editor/protocol';
import { WorkflowIssueCode } from '@fastgpt/global/core/workflow/editor/issueCode';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { getWorkflowIssueIdentity } from '@fastgpt/global/common/workflow/editor/utils';
import { workflowInputUsesSecretValues } from '@fastgpt/global/common/workflow/reference';
import { serializeRuntime } from '../codec';
import { getWorkflowModelCheckData } from '@/web/core/workflow/modelData';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/check/check';
import { getWorkflowSandboxCheckData } from '@/web/core/workflow/sandbox';
import {
  collectWorkflowErrorIssues,
  renderWorkflowIssueMessage
} from '@/web/core/workflow/issueView';
import type { WorkflowIssueLike } from '@/web/core/workflow/issueView';
import type { WorkflowLocalDraft } from '@/web/core/workflow/localDraft/storage';

type WorkflowRuntimeRef = MutableRefObject<WorkflowRuntimePort | null>;
type PendingSaveRevisionRef = MutableRefObject<number | undefined>;

export type WorkflowSaveRequest = {
  runtime: WorkflowRuntimePort;
  sessionId: string;
  appId: string;
  contentRevision: number;
  requestToken: number;
  data: StoreWorkflow;
  localDraft?: WorkflowLocalDraft;
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

/**
 * Core 与 Runtime 的展示文案可能不同，合并时按稳定语义键去重；不同 params 仍视为不同问题。
 * inputKey 与 params 使用 JSON 序列化，文案和 level 不参与身份。
 */
export const dedupeWorkflowIssueMessages = (
  issues: readonly { issue: WorkflowIssueLike; message: string }[]
): string[] => {
  const seen = new Set<string>();
  return issues.flatMap(({ issue, message }) => {
    const key = getWorkflowIssueIdentity(
      {
        nodeId: 'nodeId' in issue ? issue.nodeId : '',
        code: issue.code,
        inputKey: issue.inputKey,
        params: issue.params
      },
      { ignoreDisplayParams: true }
    );
    if (seen.has(key)) return [];
    seen.add(key);
    return [message];
  });
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
 * 运行与发布共用的校验 gate：Core 完整检查结构、IO、模型和绑定，Runtime 补充编辑期引用与资源问题。
 * 模型权限按应用基线回查；异步检查期间文档或 Session 变化时丢弃结果，避免放行未检查的数据。
 * 普通保存直接使用 serializeWorkflowData；校验失败只写焦点与提示，不返回不完整文档。
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

  const contentRevision = current.getSavepoint().contentRevision;
  const { nodes, chatConfig } = current.getWorkflowData();
  const modelData = await getWorkflowModelCheckData({ nodes, chatConfig, appId }).catch(
    () => undefined
  );
  if (
    current.isDisposed() ||
    runtimeRef.current !== current ||
    current.getSavepoint().contentRevision !== contentRevision
  )
    return undefined;
  if (!modelData) {
    if (!hideTip) toast({ status: 'error', title: t('common:model_catalog_load_failed') });
    return undefined;
  }

  // 模型能力刷新不改变内容版本。鉴权返回后先刷新，再校验未经出站归一化的编辑快照。
  const runtimeErrors = collectWorkflowErrorIssues(current);
  const snapshot = current.getWorkflowData();
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

  const nodesById = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const errors = runtimeErrors.filter((issue) => {
    // 运行和发布时，普通失效引用交给 Core 清理后校验，必填条件按清理后的值判断。
    switch (issue.code) {
      case WorkflowIssueCode.modelRequired:
      case WorkflowIssueCode.modelUnavailable:
      case WorkflowIssueCode.modelUnavailableShort:
        return false;
      case WorkflowIssueCode.invalidReference:
      case WorkflowIssueCode.invalidReferenceType:
      case WorkflowIssueCode.unreachableReference: {
        const node =
          'nodeId' in issue && typeof issue.nodeId === 'string'
            ? nodesById.get(issue.nodeId)
            : undefined;
        const input = node?.inputs.find(({ key }) => key === issue.inputKey);
        return !input || workflowInputUsesSecretValues(input, node?.flowNodeType);
      }
      default:
        return true;
    }
  });
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
      title: t('common:core.workflow.Check Failed'),
      description: dedupeWorkflowIssueMessages([
        ...checked.errorIssueMessages,
        ...errors.map((issue) => ({
          issue,
          message: renderWorkflowIssueMessage(issue, t)
        }))
      ])
        .slice(0, 3)
        .join('\n')
    });
  }
  return undefined;
};
