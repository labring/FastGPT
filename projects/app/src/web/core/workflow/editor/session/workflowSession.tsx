/**
 * 工作流编辑器 host 层：编辑器唯一的数据与生命周期边界。
 *
 * 拥有 Runtime 生命周期与 adapter 挂载、版本列表与整文档替换切换、Savepoint 与出站序列化入口、
 * 环境事实注入（模型目录与 sandbox，供 Runtime 算 Issue View）、Issue View 刷新触发与
 * 标红焦点定位、本地草稿与离开保护。
 * overlay/patchViewData 是正式的 renderer view 通道：debug 结果、搜索高亮与教程元信息
 * 按节点合并进画布投影，不进 Runtime Document，也不参与 undo/redo。
 */
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode
} from 'react';
import { useMemoizedFn, useUpdateEffect } from 'ahooks';
import { isEqual } from 'lodash-es';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import { getErrorMessage } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { LoopRunBreakNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunBreak';
import {
  hydrateWorkflowEditor,
  type StoreWorkflow
} from '@fastgpt/global/common/workflow/editor/protocol';
import type {
  WorkflowEnvironment,
  WorkflowEnvironmentModel,
  WorkflowRuntimePort,
  WorkflowSnapshot
} from '@fastgpt/global/core/workflow/editor/types';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration/schema';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useWorkflowDraftLifecycle } from '@/web/core/workflow/localDraft/useWorkflowDraftLifecycle';
import {
  readWorkflowLocalDraft,
  removeWorkflowLocalDraft,
  type WorkflowLocalDraft
} from '@/web/core/workflow/localDraft/storage';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { ensureModelCatalog, getModelReadIdentity } from '@/web/core/ai/model/modelData';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import {
  getWorkflowModelCheckData,
  peekWorkflowEnvironmentModels
} from '@/web/core/workflow/modelData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getWorkflowConnectionError, materializeWorkflow } from '../codec';
import type { ViewDataOverlayMap } from '../canvas/projectWorkflowCanvas';
import type { ViewOverlayPatch } from '../canvas/canvasTypes';
import { WorkflowEditorProvider } from '../react/workflowEditorProvider';
import { canvasNodeToStoreNode } from '../canvas/canvasTypes';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { disposeWorkflowMonacoModels } from '@fastgpt/web/components/common/Textarea/monacoModelRegistry';
import { getWorkflowEditorPathPrefix } from '../workflowEditorPath';
import {
  recordWorkflowVersion,
  syncWorkflowLiveVersion,
  type WorkflowVersionEntry
} from './workflowHistory';
import {
  createWorkflowSaveCoordinator,
  serializeWorkflowAndCheckData,
  serializeWorkflowData,
  type WorkflowSaveRequest
} from './workflowPersistence';

// region sessionContracts Session state and public hook contracts

export type WorkflowPersistenceState = {
  isSaved: boolean;
  serializeWorkflow: () => StoreWorkflow | undefined;
  serializeWorkflowAndCheck: (hideTip?: boolean) => Promise<StoreWorkflow | undefined>;
  markSaved: (request: WorkflowSaveRequest) => boolean;
  createSaveRequest: (
    appId: string,
    options?: { explicit?: boolean }
  ) => WorkflowSaveRequest | undefined;
  isCurrentSaveRequest: (request: WorkflowSaveRequest) => boolean;
  leaveSaveSign: MutableRefObject<boolean>;
  discardLocalDraft: () => void;
};

export type WorkflowHistoryState = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  versions: WorkflowVersionEntry[];
  switchVersion: (entry: WorkflowVersionEntry, customTitle: string) => boolean;
  switchCloudVersion: (appVersion: AppVersionSchemaType) => boolean;
};

type WorkflowPersistenceActions = Omit<WorkflowPersistenceState, 'isSaved'>;
type WorkflowHistoryActions = Omit<WorkflowHistoryState, 'canUndo' | 'canRedo'>;
type WorkflowDocumentReplacement = { runtime: WorkflowRuntimePort; contentRevision: number };

export type WorkflowSessionActions = {
  initRuntime: (content: CanonicalWorkflowData) => void;
  loadInitialWorkflow: (data: Omit<Parameters<typeof materializeWorkflow>[0], 't'>) => void;
  loadDocument: (
    content: CanonicalWorkflowData,
    options?: { rollbackable?: boolean }
  ) => ReturnType<WorkflowRuntimePort['dispatch']>;
  rollbackDocument: (request: WorkflowDocumentReplacement) => boolean;
  confirmDocument: (request: WorkflowDocumentReplacement) => void;
};

type WorkflowSessionValue = {
  runtime: WorkflowRuntimePort | null;
  initialLoadFailed: boolean;
  /** 当前工作流编辑页的 Monaco model 生命周期标识。 */
  editorSessionId: string;
  /**
   * renderer view 通道：host 持有的按节点视图数据（debug 结果、搜索高亮、教程元信息），
   * 只在投影时合并进画布节点。生产者见 patchViewData；不写入 Runtime Document。
   */
  overlaysRef: MutableRefObject<ViewDataOverlayMap>;
  overlayListenersRef: MutableRefObject<Map<string, Set<() => void>>>;
  /** 写入 renderer view 数据并触发一次重投影；同节点多次 patch 按 key 合并。 */
  patchViewData: (patches: ViewOverlayPatch[]) => void;

  isSaved: boolean;

  /** 问题焦点节点 id：投影据此标红并选中该节点；undefined 表示无焦点。 */
  issueFocusNodeId?: string;
  issueFocusRef: MutableRefObject<string | undefined>;
  /** 标红并定位到指定节点；传 undefined 只清除标红（节点被点击或取消选中）。 */
  focusIssueNode: (nodeId?: string) => void;

  sessionActions: WorkflowSessionActions;
  persistence: WorkflowPersistenceActions;
  historyState: WorkflowHistoryActions;
};

/** 合并 renderer overlay；完全相同的 patch 保持原引用，避免无意义的画布重投影。 */
export const mergeViewOverlayPatches = ({
  current,
  patches
}: {
  current: ViewDataOverlayMap;
  patches: ViewOverlayPatch[];
}): { overlays: ViewDataOverlayMap; changed: boolean } => {
  let overlays = current;
  let changed = false;

  patches.forEach(({ nodeId, values }) => {
    const merged = { ...overlays[nodeId], ...values };
    if (isEqual(overlays[nodeId], merged)) return;
    if (overlays === current) overlays = { ...current };
    overlays[nodeId] = merged;
    changed = true;
  });

  return { overlays, changed };
};

/** 草稿读自 JSON，比较前按相同规则省略可选字段，保持对象键顺序无关。 */
const matchesLocalDraft = (data: StoreWorkflow | undefined, draft: WorkflowLocalDraft) => {
  if (!data) return false;
  try {
    return isEqual(JSON.parse(JSON.stringify(data)), draft.data);
  } catch {
    return false;
  }
};

const notImplemented = (): never => {
  throw new Error('WorkflowHost missing');
};

const WorkflowSessionContext = createContext<WorkflowSessionValue>({
  runtime: null,
  initialLoadFailed: false,
  editorSessionId: '',
  overlaysRef: { current: {} },
  overlayListenersRef: { current: new Map() },
  patchViewData: notImplemented,
  isSaved: true,
  issueFocusNodeId: undefined,
  issueFocusRef: { current: undefined },
  focusIssueNode: notImplemented,
  sessionActions: {
    initRuntime: notImplemented,
    loadInitialWorkflow: notImplemented,
    loadDocument: notImplemented,
    rollbackDocument: notImplemented,
    confirmDocument: notImplemented
  },
  persistence: {
    serializeWorkflow: notImplemented,
    serializeWorkflowAndCheck: notImplemented,
    markSaved: notImplemented,
    createSaveRequest: notImplemented,
    isCurrentSaveRequest: notImplemented,
    leaveSaveSign: { current: true },
    discardLocalDraft: notImplemented
  },
  historyState: {
    undo: notImplemented,
    redo: notImplemented,
    versions: [],
    switchVersion: notImplemented,
    switchCloudVersion: notImplemented
  }
});
const WorkflowViewTickContext = createContext(0);

export const useWorkflowRuntime = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.runtime);

export const useWorkflowInitialLoadFailed = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.initialLoadFailed);

export const useWorkflowEditorSessionId = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.editorSessionId);

export const useWorkflowIssueFocusAction = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.focusIssueNode);

export const useWorkflowIssueFocusNodeId = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.issueFocusNodeId);

export const useWorkflowSessionActions = (): WorkflowSessionActions =>
  useContextSelector(WorkflowSessionContext, (value) => value.sessionActions);

const useRuntimeSubscription = (runtime: WorkflowRuntimePort | null) =>
  useMemo(
    () => (onStoreChange: () => void) =>
      runtime && !runtime.isDisposed() ? runtime.subscribe(onStoreChange) : () => undefined,
    [runtime]
  );

/** Runtime markSaved 不发布 change；tick 只负责让 savepoint 读取重新检查。 */
const useRuntimeSavepoint = (runtime: WorkflowRuntimePort | null, invalidation: number) => {
  const subscribe = useRuntimeSubscription(runtime);
  const getSnapshot = useCallback(
    () =>
      `${invalidation}:${runtime && !runtime.isDisposed() ? Number(runtime.getSavepoint().isDirty) : 0}`,
    [runtime, invalidation]
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return snapshot.endsWith(':1');
};

/** History snapshot 每次读取都会新建对象，订阅只返回稳定的布尔标记避免快照抖动。 */
const useRuntimeHistoryFlags = (runtime: WorkflowRuntimePort | null) => {
  const subscribe = useRuntimeSubscription(runtime);
  const getSnapshot = useCallback(() => {
    const history = runtime && !runtime.isDisposed() ? runtime.getHistory() : undefined;
    return `${history?.canUndo ? 1 : 0}:${history?.canRedo ? 1 : 0}`;
  }, [runtime]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [canUndo, canRedo] = snapshot.split(':');

  return { canUndo: canUndo === '1', canRedo: canRedo === '1' };
};

export const useWorkflowPersistence = (): WorkflowPersistenceState => {
  const isSaved = useContextSelector(WorkflowSessionContext, (value) => value.isSaved);
  const persistence = useContextSelector(WorkflowSessionContext, (value) => value.persistence);

  return useMemo(() => ({ ...persistence, isSaved }), [isSaved, persistence]);
};

export const useWorkflowHistory = (): WorkflowHistoryState => {
  const runtime = useWorkflowRuntime();
  const history = useContextSelector(WorkflowSessionContext, (value) => value.historyState);
  const { canUndo, canRedo } = useRuntimeHistoryFlags(runtime);

  return useMemo(() => ({ ...history, canUndo, canRedo }), [canRedo, canUndo, history]);
};

export const useWorkflowViewTick = () =>
  useContextSelector(WorkflowViewTickContext, (value) => value);

export const useWorkflowIssueFocusRef = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.issueFocusRef);

export const useWorkflowOverlayRef = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.overlaysRef);

export const useWorkflowOverlayValue = (nodeId?: string) => {
  const overlaysRef = useContextSelector(WorkflowSessionContext, (value) => value.overlaysRef);
  const listenersRef = useContextSelector(
    WorkflowSessionContext,
    (value) => value.overlayListenersRef
  );
  const subscribe = useCallback(
    (listener: () => void) => {
      const id = nodeId ?? '';
      const listeners = listenersRef.current.get(id) ?? new Set<() => void>();
      listeners.add(listener);
      listenersRef.current.set(id, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) listenersRef.current.delete(id);
      };
    },
    [nodeId, listenersRef]
  );
  const getSnapshot = useCallback(() => overlaysRef.current[nodeId ?? ''], [nodeId, overlaysRef]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * 语义通道：订阅 runtime 事件，但按 `getWorkflow()` 的快照身份决定是否重渲染。
 *
 * Runtime 只在语义版本变化时更换快照对象（纯几何提交与瞬时拖拽帧不换），overlay 写入与
 * 标红焦点更是根本不产生 runtime 事件，所以拖拽落点、写 debug 结果、搜索高亮与标红定位
 * 都不会带动语义派生列表重渲染；也不需要任何计数器，不存在「忘了 bump」这类 bug。
 *
 * 快照是 Runtime 版本缓存的产物：同一语义版本内身份恒定，因此可以直接当 `useMemo` 的缓存 key。
 * Issue 刷新会作废快照缓存（Issue View 在快照里），但它只走 `subscribeIssues` 通道，
 * 本 hook 不订阅，语义派生不会因为环境事实变化而重算。
 *
 * 与 `useWorkflowSnapshotGetter`（见 useWorkflowDocument）的分工：渲染期参与派生计算用本 hook，
 * 只在事件回调里读当前值用 getter（不建订阅）。
 */
export const useWorkflowSnapshot = (): WorkflowSnapshot | undefined => {
  const runtime = useWorkflowRuntime();
  const subscribe = useRuntimeSubscription(runtime);
  const getSnapshot = useCallback(
    () => (runtime && !runtime.isDisposed() ? runtime.getWorkflow() : undefined),
    [runtime]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** Debug、搜索等 renderer view 写入方只拿 overlay 命令，不依赖 Host 其余生命周期状态。 */
export const useWorkflowOverlayActions = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.patchViewData);

// endregion

// region sessionProvider Runtime lifecycle, persistence, and host state

/**
 * 编辑器 host Provider：挂在 ReactFlowProvider 内、renderer 之上。
 * Runtime 为 null（尚未 hydrate）时不挂 adapter，其余编辑器状态照常供给。
 */
type WorkflowSessionProviderProps = {
  children: ReactNode;
  /** 测试或外层预先 hydrate 的场景可直接交给 Session 接管生命周期。 */
  runtime?: WorkflowRuntimePort;
  /** 页面层注入的应用身份，用于构造编辑器级资源标识。 */
  appId?: string;
  /** 页面层当前 chatConfig；Session 只负责同步到 Runtime。 */
  appDetailChatConfig?: AppChatConfigType;
  /** Runtime chatConfig 变化后回写页面状态。 */
  onChatConfigChange?: (chatConfig: AppChatConfigType) => void;
};

export const WorkflowSessionProvider = ({
  children,
  runtime: initialRuntime,
  appId = '',
  appDetailChatConfig,
  onChatConfigChange
}: WorkflowSessionProviderProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus, userInfo } = useUserStore();
  const loginTmbId = userInfo?.team?.tmbId;
  const hasWritePermission = useContextSelector(
    AppContext,
    ({ appDetail }) => appDetail._id === appId && appDetail.permission?.hasWritePer
  );
  const showSandbox = feConfigs?.show_agent_sandbox;
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;

  // appId intentionally rotates the session identity when switching apps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const editorSessionId = useMemo(() => getNanoid(12), [appId]);
  const editorModelUriPrefix = useMemo(
    () => getWorkflowEditorPathPrefix({ appId, sessionId: editorSessionId }),
    [appId, editorSessionId]
  );

  useEffect(() => {
    return () => disposeWorkflowMonacoModels(editorModelUriPrefix);
  }, [editorModelUriPrefix]);

  const [runtime, setRuntime] = useState<WorkflowRuntimePort | null>(null);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [recoveryNeedsSave, setRecoveryNeedsSave] = useState(false);
  const recoveredLocalDraftRef = useRef<WorkflowLocalDraft>();
  const writtenLocalDraftRef = useRef<WorkflowLocalDraft>();
  const sessionActiveRef = useRef(true);
  const runtimeRef = useRef<WorkflowRuntimePort | null>(null);
  const initialRuntimeSeenRef = useRef(false);
  const [viewTick, setViewTick] = useState(0);
  useLayoutEffect(() => {
    sessionActiveRef.current = true;
    return () => {
      // 历史加载、导入的异步结果可能晚于切换应用的卸载。
      sessionActiveRef.current = false;
    };
  }, []);
  const [savepointTick, bumpSavepointTick] = useReducer((count: number) => count + 1, 0);
  const overlaysRef = useRef<ViewDataOverlayMap>({});
  const overlayListenersRef = useRef(new Map<string, Set<() => void>>());
  const [versions, setVersionsRaw] = useState<WorkflowVersionEntry[]>([]);
  const versionsRef = useRef<WorkflowVersionEntry[]>([]);
  const pendingReplacementRef = useRef<
    WorkflowDocumentReplacement & { versions: WorkflowVersionEntry[] }
  >();
  const suppressVersionHistoryRef = useRef(false);
  const pendingSaveRevision = useRef<number | undefined>(undefined);
  const saveCoordinator = useMemo(() => createWorkflowSaveCoordinator(), []);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const unsubscribeIssuesRef = useRef<(() => void) | undefined>(undefined);
  const leaveSaveSign = useRef(true);
  const [issueFocusNodeId, setIssueFocusNodeId] = useState<string>();
  const issueFocusRef = useRef<string | undefined>(undefined);
  const environmentModelsRef = useRef<Pick<WorkflowEnvironment, 'models' | 'defaultModelIds'>>();
  const updateIssueFocusNode = useMemoizedFn((nodeId?: string) => {
    if (issueFocusRef.current === nodeId) return false;
    issueFocusRef.current = nodeId;
    setIssueFocusNodeId(nodeId);
    return true;
  });
  const bumpView = useMemoizedFn(() => {
    setViewTick((tick) => tick + 1);
  });
  const focusIssueNode = useMemoizedFn((nodeId?: string) => {
    if (updateIssueFocusNode(nodeId)) {
      bumpView();
    }
  });
  /** 首屏延后聚焦首个错误；孤立的起始节点只保留气泡，避免空白流程初次进入被强制拉红。 */
  const focusInitialIssue = useMemoizedFn((current: WorkflowRuntimePort) => {
    window.setTimeout(() => {
      if (runtimeRef.current !== current || current.isDisposed()) return;
      const firstErrorNode = current
        .getWorkflow()
        .nodes.find((node) => node.issues.some((issue) => issue.level === 'error'));
      if (!firstErrorNode) return;

      const errorIssues = firstErrorNode.issues.filter((issue) => issue.level === 'error');
      const isEntryNode =
        firstErrorNode.flowNodeType === FlowNodeTypeEnum.workflowStart ||
        firstErrorNode.flowNodeType === FlowNodeTypeEnum.pluginInput;
      const isIsolatedEntryOnly =
        isEntryNode && errorIssues.every((issue) => issue.code === 'isolated_node');
      if (!isIsolatedEntryOnly) focusIssueNode(firstErrorNode.nodeId);
    }, 300);
  });
  // 订阅回调里回写页面状态，用 ref 避免 chatConfig 变化导致重新订阅。
  const onChatConfigChangeRef = useRef(onChatConfigChange);
  const translationRef = useRef(t);
  useEffect(() => {
    onChatConfigChangeRef.current = onChatConfigChange;
    translationRef.current = t;
  }, [appDetailChatConfig, onChatConfigChange, t]);

  /**
   * Runtime 的环境事实来源：模型目录与 sandbox 开关。
   * Runtime 每轮派生同步调用且不缓存，因此这里只读已就绪的 store 快照，不发请求。
   */
  const getEnvironment = useMemoizedFn(
    (): WorkflowEnvironment => ({
      ...(environmentModelsRef.current ?? peekWorkflowEnvironmentModels()),
      sandbox: { configured: !!showSandbox, planSupported: enableSandbox }
    })
  );

  const setVersions = useMemoizedFn((next: WorkflowVersionEntry[]) => {
    versionsRef.current = next;
    setVersionsRaw(next);
  });

  const recordVersionHistory = useMemoizedFn(
    (current: WorkflowRuntimePort, entry?: Pick<WorkflowVersionEntry, 'title' | 'content'>) => {
      setVersions(recordWorkflowVersion({ current, versions: versionsRef.current, entry }));
    }
  );

  /** undo/redo 只移动当前版本标记，不新增侧边栏记录。 */
  const syncLiveVersion = useMemoizedFn((current: WorkflowRuntimePort) => {
    const next = syncWorkflowLiveVersion({ current, versions: versionsRef.current });
    if (next) setVersions(next);
  });

  const teardownRuntime = useMemoizedFn(() => {
    saveCoordinator.invalidate();
    unsubscribeRef.current?.();
    unsubscribeRef.current = undefined;
    unsubscribeIssuesRef.current?.();
    unsubscribeIssuesRef.current = undefined;
    if (runtimeRef.current && !runtimeRef.current.isDisposed()) {
      runtimeRef.current.dispose();
    }
    runtimeRef.current = null;
  });

  const clearOverlays = useMemoizedFn(() => {
    const clearedNodeIds = Object.keys(overlaysRef.current);
    if (clearedNodeIds.length === 0) return;
    overlaysRef.current = {};
    clearedNodeIds.forEach((nodeId) => {
      overlayListenersRef.current.get(nodeId)?.forEach((listener) => listener());
    });
  });

  const resetSessionState = useMemoizedFn((nextVersions: WorkflowVersionEntry[]) => {
    clearOverlays();
    updateIssueFocusNode(undefined);
    pendingSaveRevision.current = undefined;
    pendingReplacementRef.current = undefined;
    saveCoordinator.invalidate();
    leaveSaveSign.current = true;
    setVersions(nextVersions);
    bumpView();
  });

  const attachRuntime = useMemoizedFn((next: WorkflowRuntimePort) => {
    teardownRuntime();
    runtimeRef.current = next;
    unsubscribeRef.current = next.subscribe((change) => {
      // undo/redo/replace 恢复文档 chatConfig 时回写 appDetail。
      if (change.changedRecords.chatConfig && !next.isDisposed()) {
        // snapshot 是 DeepReadonly；appDetail 需要可变类型，这里只做引用替换不修改内容。
        const nextConfig = AppChatConfigTypeSchema.parse(next.getWorkflow().chatConfig);
        onChatConfigChangeRef.current?.(nextConfig);
      }
      if (change.origin === 'command' && !suppressVersionHistoryRef.current) {
        recordVersionHistory(next);
      } else if (change.origin !== 'command') {
        syncLiveVersion(next);
      }
    });
    unsubscribeIssuesRef.current = next.subscribeIssues(() => {
      const focusedNodeId = issueFocusRef.current;
      if (!focusedNodeId) return;
      const focusedNode = next.getNode(focusedNodeId);
      if (!focusedNode || !focusedNode.issues.some((issue) => issue.level === 'error')) {
        focusIssueNode(undefined);
      }
    });
    setRuntime(next);
    setInitialLoadFailed(false);
  });

  const initialRuntimeActive = !!initialRuntime && !initialRuntime.isDisposed();

  useEffect(() => {
    const nextInitialRuntime =
      initialRuntime && !initialRuntime.isDisposed() ? initialRuntime : undefined;
    if (!nextInitialRuntime) {
      // 普通页面先挂载子组件，再由 initRuntime 创建内部 Runtime；这不是外部 prop 移除。
      if (!initialRuntimeSeenRef.current) return;
      initialRuntimeSeenRef.current = false;
      if (!runtimeRef.current) return;
      teardownRuntime();
      setRuntime(null);
      resetSessionState([]);
      return;
    }
    initialRuntimeSeenRef.current = true;
    if (runtimeRef.current === nextInitialRuntime) return;
    attachRuntime(nextInitialRuntime);
    resetSessionState([
      {
        title: translationRef.current('app:app.version_initial'),
        content: nextInitialRuntime.getWorkflowData(),
        contentRevision: nextInitialRuntime.getSavepoint().contentRevision,
        live: true
      }
    ]);
    focusInitialIssue(nextInitialRuntime);
  }, [
    attachRuntime,
    bumpView,
    focusInitialIssue,
    initialRuntime,
    initialRuntimeActive,
    resetSessionState,
    setVersions,
    teardownRuntime,
    updateIssueFocusNode
  ]);

  // 只同步挂载后的 SystemConfigDrawer 修改；首屏配置由载入的云端版本或本地草稿提供。
  useUpdateEffect(() => {
    const current = runtimeRef.current;
    if (appDetailChatConfig === undefined || !current || current.isDisposed()) return;
    const docConfig = current.getWorkflow().chatConfig;
    if (!isEqual(docConfig, appDetailChatConfig)) {
      current.dispatch({ type: 'updateChatConfig', chatConfig: appDetailChatConfig });
    }
  }, [appDetailChatConfig]);

  const isDirty = useRuntimeSavepoint(runtime, savepointTick);
  const isSaved = !isDirty && (!runtime || !recoveryNeedsSave);

  /**
   * 问题焦点：标红哪个节点由 host 单点持有（旧行为同一时刻只标红一个），投影合并进节点 data。
   * 传入 nodeId 时更新焦点序号，画布在尺寸进入 Dimension Index 后负责定位；传 undefined 只清除
   * 标红，用于节点被点击或取消选中的场景，此时不应移动视口。
   */
  const serializeWorkflow = useMemoizedFn(() =>
    serializeWorkflowData({
      runtimeRef,
      pendingSaveRevisionRef: pendingSaveRevision
    })
  );

  const createSaveRequest = useMemoizedFn<WorkflowPersistenceState['createSaveRequest']>(
    (requestAppId, { explicit = false } = {}) => {
      // 恢复后的节点升级和其他隐式保存都须等待用户确认整份工作流。
      if ((recoveryNeedsSave || recoveredLocalDraftRef.current) && !explicit) return undefined;
      const current = runtimeRef.current;
      if (!current || current.isDisposed() || !requestAppId) return undefined;

      const data = serializeWorkflowData({
        runtimeRef,
        pendingSaveRevisionRef: pendingSaveRevision
      });
      const contentRevision = pendingSaveRevision.current;
      if (!data || contentRevision === undefined) return undefined;
      const localDraft = (() => {
        if (!explicit || !loginTmbId) return;
        // 本页先前写入的备份也已被这次显式保存覆盖，删除时仍核对存储里的精确快照。
        const ownedDraft = writtenLocalDraftRef.current ?? recoveredLocalDraftRef.current;
        if (ownedDraft?.appId === requestAppId && ownedDraft.tmbId === loginTmbId) {
          return ownedDraft;
        }
        const draft = readWorkflowLocalDraft({ appId: requestAppId, tmbId: loginTmbId });
        if (draft && matchesLocalDraft(data, draft)) return draft;
      })();

      return saveCoordinator.begin({
        runtime: current,
        sessionId: editorSessionId,
        appId: requestAppId,
        contentRevision,
        data,
        localDraft
      });
    }
  );

  const isCurrentSaveRequest = useMemoizedFn((request: WorkflowSaveRequest) =>
    saveCoordinator.isCurrent(request, {
      runtime: runtimeRef.current,
      sessionId: editorSessionId,
      appId
    })
  );

  const serializeWorkflowAndCheck = useMemoizedFn((hideTip = false) =>
    serializeWorkflowAndCheckData({
      runtimeRef,
      appId,
      pendingSaveRevisionRef: pendingSaveRevision,
      hideTip,
      toast,
      t,
      focusIssueNode
    })
  );

  const markSaved = useMemoizedFn((request: WorkflowSaveRequest) => {
    if (
      runtimeRef.current !== request.runtime ||
      request.sessionId !== editorSessionId ||
      request.appId !== appId ||
      request.runtime.isDisposed()
    )
      return false;

    request.runtime.markSaved(request.contentRevision);
    if (request.localDraft) {
      removeWorkflowLocalDraft(request.localDraft);
      if (writtenLocalDraftRef.current === request.localDraft) {
        writtenLocalDraftRef.current = undefined;
      }
    }
    recoveredLocalDraftRef.current = undefined;
    setRecoveryNeedsSave(false);
    if (pendingSaveRevision.current === request.contentRevision) {
      pendingSaveRevision.current = undefined;
    }
    bumpSavepointTick();
    return true;
  });

  const initRuntime = useMemoizedFn(
    (content: CanonicalWorkflowData, initialTitle = t('app:app.version_initial')) => {
      // Issue View 由 Runtime 按文档规则与环境事实算出；Workflow 与 Plugin host 共用这一份接线。
      let nextRuntime: WorkflowRuntimePort;
      try {
        nextRuntime = hydrateWorkflowEditor(content, {
          getEnvironment,
          getConnectionError: getWorkflowConnectionError,
          createLoopRunBreakNode: ({ parentNodeId, position }) =>
            canvasNodeToStoreNode(
              nodeTemplate2FlowNode({
                template: LoopRunBreakNode,
                position,
                parentNodeId,
                t
              })
            )
        });
      } catch (error) {
        teardownRuntime();
        setRuntime(null);
        resetSessionState([]);
        throw error;
      }
      if (recoveryNeedsSave) {
        onChatConfigChangeRef.current?.(
          AppChatConfigTypeSchema.parse(nextRuntime.getWorkflow().chatConfig)
        );
      }
      attachRuntime(nextRuntime);
      resetSessionState([
        {
          title: initialTitle,
          content: nextRuntime.getWorkflowData(),
          contentRevision: nextRuntime.getSavepoint().contentRevision,
          live: true
        }
      ]);
      focusInitialIssue(nextRuntime);
    }
  );

  /** 导入等重载路径：保留 Runtime 实例与历史（导入可撤销），整文档替换并清视图数据。 */
  const loadDocument = useMemoizedFn<WorkflowSessionActions['loadDocument']>(
    (content, { rollbackable } = {}) => {
      if (!sessionActiveRef.current) {
        return {
          ok: false,
          error: { code: 'disposed', message: 'Workflow editor has been disposed' }
        };
      }
      const current = runtimeRef.current;
      if (!current || current.isDisposed()) {
        try {
          initRuntime(content);
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: { code: 'invalid_command', message: getErrorMessage(error) }
          };
        }
      }
      const previousVersions = versionsRef.current;
      const res = current.dispatch({ type: 'replaceDocument', document: content, rollbackable });
      if (!res.ok) return res;
      if (rollbackable && res.change) {
        pendingReplacementRef.current = {
          runtime: current,
          contentRevision: current.getSavepoint().contentRevision,
          versions: previousVersions
        };
      }
      clearOverlays();
      updateIssueFocusNode(undefined);
      pendingSaveRevision.current = undefined;
      bumpView();
      return res;
    }
  );

  /** 失败的外部应用与 Runtime 一起移出侧栏历史，其他会话或较新的编辑不受影响。 */
  const rollbackDocument = useMemoizedFn<WorkflowSessionActions['rollbackDocument']>(
    ({ runtime, contentRevision }) => {
      if (!sessionActiveRef.current || runtime !== runtimeRef.current) return false;
      const result = runtime.rollbackDocumentReplacement(contentRevision);
      if (!result.ok) return false;

      const pending = pendingReplacementRef.current;
      const versions =
        pending?.runtime === runtime && pending.contentRevision === contentRevision
          ? pending.versions
          : versionsRef.current.filter((entry) => entry.contentRevision !== contentRevision);
      setVersions(syncWorkflowLiveVersion({ current: runtime, versions }) ?? versions);
      return true;
    }
  );

  /** 归档完成或取消回滚后清除两处替换基线。 */
  const confirmDocument = useMemoizedFn<WorkflowSessionActions['confirmDocument']>(
    ({ runtime, contentRevision }) => {
      runtime.confirmDocumentReplacement(contentRevision);
      const pending = pendingReplacementRef.current;
      if (pending?.runtime === runtime && pending.contentRevision === contentRevision) {
        pendingReplacementRef.current = undefined;
      }
    }
  );

  /** 先载入云端版本供回退，再恢复同一应用和成员的本地草稿，等待显式保存。 */
  const loadInitialWorkflow = useMemoizedFn<WorkflowSessionActions['loadInitialWorkflow']>(
    ({ input, chatConfig }) => {
      try {
        initRuntime(materializeWorkflow({ input, chatConfig, t }));
      } catch {
        setInitialLoadFailed(true);
        setRecoveryNeedsSave(true);
      }

      if (!hasWritePermission || !loginTmbId) return;
      const draft = readWorkflowLocalDraft({ appId, tmbId: loginTmbId });
      if (!draft) return;
      try {
        if (matchesLocalDraft(serializeWorkflow(), draft)) {
          removeWorkflowLocalDraft(draft);
          return;
        }
        const content = materializeWorkflow({
          input: draft.data,
          chatConfig: draft.data.chatConfig,
          t
        });
        const current = runtimeRef.current;
        const hadRuntime = !!current && !current.isDisposed();
        const result = loadDocument(content);
        if (!result.ok) return;
        // 旧草稿可能缺省字段，迁移后与云端相同，此时 Runtime 不会产生替换记录。
        if (hadRuntime && !result.change) {
          removeWorkflowLocalDraft(draft);
          return;
        }
        if (!hadRuntime) {
          onChatConfigChangeRef.current?.(AppChatConfigTypeSchema.parse(content.chatConfig));
        }
        recoveredLocalDraftRef.current = draft;
        setRecoveryNeedsSave(true);
      } catch {
        // 本地配置无法载入时保留副本与当前云端版本。
      }
    }
  );

  /** 本地版本按 Runtime revision 回放；云端副本实际替换文档后才新增版本条目。 */
  const switchVersion = useMemoizedFn(
    (entry: WorkflowVersionEntry, customTitle: string): boolean => {
      const current = runtimeRef.current;
      if (!current || current.isDisposed()) return false;
      let res =
        entry.contentRevision === undefined
          ? undefined
          : current.replayHistoryToRevision(entry.contentRevision);
      if (!res?.ok) {
        if (!entry.content || (res && res.error?.code !== 'not_found')) return false;
        // 初始版本超出回放上限时，与云端副本一样从保留的快照恢复。
        suppressVersionHistoryRef.current = true;
        try {
          res = current.dispatch({ type: 'replaceDocument', document: entry.content });
        } finally {
          suppressVersionHistoryRef.current = false;
        }
        if (!res.ok) return false;
        if (res.change) {
          recordVersionHistory(current, { title: customTitle, content: entry.content });
        }
      }
      if (!res.change) return true;

      clearOverlays();
      updateIssueFocusNode(undefined);
      pendingSaveRevision.current = undefined;
      // 文档替换事件已经带动画布投影，但那次投影读到的还是清理前的 overlay 与标红焦点，
      // 这里再 bump 一次让画布按清理后的视图数据重投影。
      bumpView();
      return true;
    }
  );

  const switchCloudVersion = useMemoizedFn((appVersion: AppVersionSchemaType) => {
    if (!sessionActiveRef.current) return false;
    try {
      const content = materializeWorkflow({
        input: {
          nodes: appVersion.nodes,
          edges: appVersion.edges,
          referenceSnapshots: appVersion.referenceSnapshots
        },
        chatConfig: appVersion.chatConfig,
        t
      });
      const title = `${t('app:version_copy')}-${appVersion.versionName}`;
      if (!runtimeRef.current || runtimeRef.current.isDisposed()) {
        initRuntime(content, title);
        return true;
      }
      if (switchVersion({ title, content }, title)) return true;
    } catch {
      // 未能打开的历史版本不替换当前内容。
    }
    toast({ title: t('common:load_failed'), status: 'error' });
    return false;
  });

  const undo = useMemoizedFn(() => {
    runtimeRef.current?.undo();
  });
  const redo = useMemoizedFn(() => {
    runtimeRef.current?.redo();
  });

  const patchViewData = useMemoizedFn((patches: ViewOverlayPatch[]) => {
    if (patches.length === 0) return;
    const result = mergeViewOverlayPatches({ current: overlaysRef.current, patches });
    if (!result.changed) return;
    overlaysRef.current = result.overlays;
    new Set(patches.map((patch) => patch.nodeId)).forEach((nodeId) => {
      overlayListenersRef.current.get(nodeId)?.forEach((listener) => listener());
    });
    bumpView();
  });
  /** 让 Runtime 按当前环境事实重算整份 Issue View；文档变更由 Runtime 在事务后自行定向刷新。 */
  const refreshIssues = useMemoizedFn(() => {
    const current = runtimeRef.current;
    if (!current || current.isDisposed()) return;
    current.refreshIssues('all');
  });

  /**
   * 环境事实（模型目录、sandbox 开关）不进文档，变化后必须显式让 Runtime 重算 Issue View。
   * 目录冷启动只加载一次，目录更新后用当前工作流重查应用已授权的模型状态。
   */
  useEffect(() => {
    if (!runtime) return;
    let active = true;
    let timer: number | undefined;
    let requestRevision = 0;
    const isCurrentRuntime = () =>
      active && runtimeRef.current === runtime && !runtime.isDisposed();
    const updateEnvironmentModels = async () => {
      if (!isCurrentRuntime()) return;
      const revision = ++requestRevision;
      const catalog = peekWorkflowEnvironmentModels();
      if (!catalog) {
        environmentModelsRef.current = undefined;
        refreshIssues();
        return;
      }
      const identity = getModelReadIdentity()?.key;
      const { nodes, chatConfig } = runtime.getWorkflow();
      const appModels = appId
        ? (await getWorkflowModelCheckData({ nodes, chatConfig, appId })).references
        : [];

      // 等待摘要时可能已切换目录、成员或应用，旧响应不能覆盖新环境。
      if (
        !isCurrentRuntime() ||
        revision !== requestRevision ||
        identity !== getModelReadIdentity()?.key
      )
        return;

      const models = new Map<string, WorkflowEnvironmentModel>(
        catalog.models.map((model) => [model.modelId, model])
      );
      appModels.forEach((model) => {
        if (!models.has(model.modelId)) models.set(model.modelId, model);
      });
      environmentModelsRef.current = {
        models: [...models.values()],
        defaultModelIds: catalog.defaultModelIds
      };
      refreshIssues();
    };

    environmentModelsRef.current = undefined;
    const unsubscribe = useUserModelStore.subscribe((state, prev) => {
      if (state.modelList === prev.modelList && state.defaultModelIds === prev.defaultModelIds)
        return;
      requestRevision += 1;
      window.clearTimeout(timer);
      // store 写入早于凭证校验完成，下一宏任务才能读取已校验目录。
      timer = window.setTimeout(() => {
        void updateEnvironmentModels().catch(() => undefined);
      }, 0);
    });
    void ensureModelCatalog()
      .then(() => {
        window.clearTimeout(timer);
        return updateEnvironmentModels();
      })
      .catch(() => undefined);
    // 挂载与 sandbox 开关变化都走到这里：环境事实已经不同，直接重算一轮。
    refreshIssues();

    return () => {
      active = false;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [appId, loginTmbId, runtime, refreshIssues, showSandbox, enableSandbox]);

  // 本地草稿、beforeunload 与卸载自动保存、鉴权过期草稿。
  const { authExpiredModal, discardWrittenDraft } = useWorkflowDraftLifecycle({
    appId,
    runtime,
    isSaved,
    serializeWorkflow,
    allowLoginRestore: !recoveryNeedsSave,
    leaveSaveSign,
    writtenDraftRef: writtenLocalDraftRef,
    createSaveRequest
  });

  /** 直接退出仅丢弃本页恢复或写入的快照，保留其他标签页的更新。 */
  const discardLocalDraft = useMemoizedFn(() => {
    discardWrittenDraft();
    const draft = recoveredLocalDraftRef.current;
    if (draft) removeWorkflowLocalDraft(draft);
  });

  // 必须声明在草稿生命周期之后：卸载清理按声明顺序执行，自动保存要先于 Runtime 释放。
  useEffect(
    () => () => {
      teardownRuntime();
      setRuntime(null);
      resetSessionState([]);
    },
    [resetSessionState, teardownRuntime]
  );

  const sessionActions = useMemo<WorkflowSessionActions>(
    () => ({ initRuntime, loadInitialWorkflow, loadDocument, rollbackDocument, confirmDocument }),
    [initRuntime, loadInitialWorkflow, loadDocument, rollbackDocument, confirmDocument]
  );
  const persistence = useMemo<WorkflowPersistenceActions>(
    () => ({
      serializeWorkflow,
      serializeWorkflowAndCheck,
      markSaved,
      createSaveRequest,
      isCurrentSaveRequest,
      leaveSaveSign,
      discardLocalDraft
    }),
    [
      serializeWorkflow,
      serializeWorkflowAndCheck,
      markSaved,
      createSaveRequest,
      isCurrentSaveRequest,
      discardLocalDraft
    ]
  );
  const historyState = useMemo<WorkflowHistoryActions>(
    () => ({
      undo,
      redo,
      versions,
      switchVersion,
      switchCloudVersion
    }),
    [undo, redo, versions, switchVersion, switchCloudVersion]
  );

  const value: WorkflowSessionValue = useMemo(
    () => ({
      runtime,
      initialLoadFailed,
      editorSessionId,
      overlaysRef,
      overlayListenersRef,
      patchViewData,
      isSaved,
      issueFocusNodeId,
      issueFocusRef,
      focusIssueNode,
      sessionActions,
      persistence,
      historyState
    }),
    [
      runtime,
      initialLoadFailed,
      editorSessionId,
      overlaysRef,
      overlayListenersRef,
      patchViewData,
      isSaved,
      issueFocusNodeId,
      focusIssueNode,
      sessionActions,
      persistence,
      historyState
    ]
  );

  return (
    <WorkflowViewTickContext.Provider value={viewTick}>
      <WorkflowSessionContext.Provider value={value}>
        <WorkflowEditorProvider runtime={runtime}>
          {children}
          {authExpiredModal}
        </WorkflowEditorProvider>
      </WorkflowSessionContext.Provider>
    </WorkflowViewTickContext.Provider>
  );
};

// endregion
