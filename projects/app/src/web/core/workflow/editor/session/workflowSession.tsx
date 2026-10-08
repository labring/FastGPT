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
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode
} from 'react';
import { useMemoizedFn } from 'ahooks';
import { isEqual } from 'lodash-es';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import {
  hydrateWorkflowEditor,
  type StoreWorkflow
} from '@fastgpt/global/core/workflow/editor/protocol';
import type {
  WorkflowEnvironment,
  WorkflowRuntimePort,
  WorkflowSnapshot
} from '@fastgpt/global/core/workflow/editor/types';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration';
import { useWorkflowDraftLifecycle } from '@/web/core/workflow/localDraft/useWorkflowDraftLifecycle';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { ensureModelCatalog } from '@/web/core/ai/model/modelData';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { peekWorkflowEnvironmentModels } from '@/web/core/workflow/modelData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { materializeWorkflow } from '../codec';
import type { ViewDataOverlayMap } from '../canvas/projectWorkflowCanvas';
import type { ViewOverlayPatch } from '../canvas/canvasTypes';
import { WorkflowEditorProvider } from '../react/workflowEditorProvider';
import { disposeWorkflowMonacoModels } from '@fastgpt/web/components/common/Textarea/monacoModelRegistry';
import { getWorkflowEditorPathPrefix } from '../workflowEditorPath';
import {
  recordWorkflowVersion,
  syncWorkflowLiveVersion,
  type WorkflowVersionEntry
} from './workflowHistory';
import {
  markWorkflowSaved,
  serializeWorkflowAndCheckData,
  serializeWorkflowData
} from './workflowPersistence';

type WorkflowSessionValue = {
  runtime: WorkflowRuntimePort | null;
  /** 当前工作流编辑页的 Monaco model 生命周期标识。 */
  editorSessionId: string;
  /**
   * 视图计数器：只承载 renderer view 通道的失效——overlay 写入、标红焦点，以及重载文档/
   * 切换版本时对这两者的清理。
   *
   * runtime 语义与几何事件不经过它：语义派生订阅 `runtime.getWorkflow()` 的快照身份
   * （见 `useWorkflowSnapshot`），画布投影直接订阅 runtime 事件（见 workflowCanvasContext）。
   * 因此拖拽落点、单字段提交都不会带动只关心 overlay 的消费者，反之亦然。
   */
  viewTick: number;
  /** 问题焦点变化序号；画布据此用 Dimension Index 重新定位视口。 */
  issueFocusTick: number;

  /**
   * renderer view 通道：host 持有的按节点视图数据（debug 结果、搜索高亮、教程元信息），
   * 只在投影时合并进画布节点。生产者见 patchViewData；不写入 Runtime Document。
   */
  overlaysRef: MutableRefObject<ViewDataOverlayMap>;
  /** 写入 renderer view 数据并触发一次重投影；同节点多次 patch 按 key 合并。 */
  patchViewData: (patches: ViewOverlayPatch[]) => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  versions: WorkflowVersionEntry[];
  switchVersion: (entry: WorkflowVersionEntry, customTitle: string) => boolean;
  switchCloudVersion: (appVersion: AppVersionSchemaType) => boolean;

  /** 当前内容是否等于已保存内容；撤销回已保存内容会自然回到已保存态。 */
  isSaved: boolean;
  /** 置 false 表示主动离开，跳过离开保护与自动保存。 */
  leaveSaveSign: MutableRefObject<boolean>;
  /** 出站序列化（保存、发布、草稿、调试共用）；同时捕获内容版本供 markSaved 回填。 */
  serializeWorkflow: () => StoreWorkflow | undefined;
  /** 保存、发布、调试共用的 host 校验与序列化 gate。 */
  serializeWorkflowAndCheck: (hideTip?: boolean) => Promise<StoreWorkflow | undefined>;
  /** 保存成功后回填 Savepoint；失败不调用即不回填，请求期间的新编辑仍算未保存。 */
  markSaved: () => void;

  /** 问题焦点节点 id：投影据此标红并选中该节点；undefined 表示无焦点。 */
  issueFocusNodeId?: string;
  issueFocusRef: MutableRefObject<string | undefined>;
  /** 标红并定位到指定节点；传 undefined 只清除标红（节点被点击或取消选中）。 */
  focusIssueNode: (nodeId?: string) => void;

  initRuntime: (content: CanonicalWorkflowData) => void;
  loadDocument: (content: CanonicalWorkflowData) => void;
  sessionActions: WorkflowSessionActions;
  persistence: WorkflowPersistenceState;
  historyState: WorkflowHistoryState;
};

export type WorkflowSessionActions = Pick<WorkflowSessionValue, 'initRuntime' | 'loadDocument'>;

export type WorkflowPersistenceState = Pick<
  WorkflowSessionValue,
  'isSaved' | 'serializeWorkflow' | 'serializeWorkflowAndCheck' | 'markSaved' | 'leaveSaveSign'
>;

export type WorkflowHistoryState = Pick<
  WorkflowSessionValue,
  'undo' | 'redo' | 'canUndo' | 'canRedo' | 'versions' | 'switchVersion' | 'switchCloudVersion'
>;

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

const notImplemented = (): never => {
  throw new Error('WorkflowHost missing');
};

const WorkflowSessionContext = createContext<WorkflowSessionValue>({
  runtime: null,
  editorSessionId: '',
  viewTick: 0,
  issueFocusTick: 0,
  overlaysRef: { current: {} },
  patchViewData: notImplemented,
  undo: notImplemented,
  redo: notImplemented,
  canUndo: false,
  canRedo: false,
  versions: [],
  switchVersion: notImplemented,
  switchCloudVersion: notImplemented,
  isSaved: true,
  leaveSaveSign: { current: true },
  serializeWorkflow: notImplemented,
  serializeWorkflowAndCheck: notImplemented,
  markSaved: notImplemented,
  issueFocusNodeId: undefined,
  issueFocusRef: { current: undefined },
  focusIssueNode: notImplemented,
  initRuntime: notImplemented,
  loadDocument: notImplemented,
  sessionActions: {
    initRuntime: notImplemented,
    loadDocument: notImplemented
  },
  persistence: {
    isSaved: true,
    serializeWorkflow: notImplemented,
    serializeWorkflowAndCheck: notImplemented,
    markSaved: notImplemented,
    leaveSaveSign: { current: true }
  },
  historyState: {
    undo: notImplemented,
    redo: notImplemented,
    canUndo: false,
    canRedo: false,
    versions: [],
    switchVersion: notImplemented,
    switchCloudVersion: notImplemented
  }
});

export const useWorkflowRuntime = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.runtime);

export const useWorkflowEditorSessionId = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.editorSessionId);

export const useWorkflowIssueFocusAction = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.focusIssueNode);

export const useWorkflowIssueFocusNodeId = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.issueFocusNodeId);

export const useWorkflowSessionActions = (): WorkflowSessionActions =>
  useContextSelector(WorkflowSessionContext, (value) => value.sessionActions);

export const useWorkflowPersistence = (): WorkflowPersistenceState =>
  useContextSelector(WorkflowSessionContext, (value) => value.persistence);

export const useWorkflowHistory = (): WorkflowHistoryState =>
  useContextSelector(WorkflowSessionContext, (value) => value.historyState);

export const useWorkflowViewTick = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.viewTick);

export const useWorkflowIssueFocusRef = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.issueFocusRef);

export const useWorkflowIssueFocusTick = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.issueFocusTick);

export const useWorkflowOverlayRef = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.overlaysRef);

export const useWorkflowOverlayValue = (nodeId?: string) => {
  useWorkflowViewTick();
  return useContextSelector(
    WorkflowSessionContext,
    (value) => value.overlaysRef.current[nodeId ?? '']
  );
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

  const subscribe = useMemo(
    () => (onStoreChange: () => void) => runtime?.subscribe(onStoreChange) ?? (() => undefined),
    [runtime]
  );
  const getSnapshot = useCallback(
    () => (runtime && !runtime.isDisposed() ? runtime.getWorkflow() : undefined),
    [runtime]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** Debug、搜索等 renderer view 写入方只拿 overlay 命令，不依赖 Host 其余生命周期状态。 */
export const useWorkflowOverlayActions = () =>
  useContextSelector(WorkflowSessionContext, (value) => value.patchViewData);

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
  const { teamPlanStatus } = useUserStore();
  const showSandbox = feConfigs?.show_agent_sandbox;
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;

  const editorSessionId = useMemo(() => getNanoid(12), [appId]);
  const editorModelUriPrefix = useMemo(
    () => getWorkflowEditorPathPrefix({ appId, sessionId: editorSessionId }),
    [appId, editorSessionId]
  );

  useEffect(() => {
    return () => disposeWorkflowMonacoModels(editorModelUriPrefix);
  }, [editorModelUriPrefix]);

  const [runtime, setRuntime] = useState<WorkflowRuntimePort | null>(null);
  const runtimeRef = useRef<WorkflowRuntimePort | null>(null);
  const [viewTick, setViewTick] = useState(0);
  const [issueFocusTick, setIssueFocusTick] = useState(0);
  /**
   * host 自身的重渲染触发：canUndo / canRedo / isSaved 都是渲染期从 runtime 读出来的派生值，
   * 任何 runtime 事件之后都要重算。它不进 context value，消费者拿不到，因此不可能被当成
   * 语义或几何通道误用（语义走快照身份，几何走画布自己的 runtime 订阅）。
   */
  const [, notifyHost] = useReducer((count: number) => count + 1, 0);
  const overlaysRef = useRef<ViewDataOverlayMap>({});
  const [versions, setVersionsRaw] = useState<WorkflowVersionEntry[]>([]);
  const versionsRef = useRef<WorkflowVersionEntry[]>([]);
  const suppressVersionHistoryRef = useRef(false);
  const pendingSaveRevision = useRef<number | undefined>(undefined);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const leaveSaveSign = useRef(true);
  const [issueFocusNodeId, setIssueFocusNodeId] = useState<string>();
  const issueFocusRef = useRef<string | undefined>(undefined);
  const updateIssueFocusNode = useMemoizedFn((nodeId?: string) => {
    if (issueFocusRef.current === nodeId) return false;
    issueFocusRef.current = nodeId;
    setIssueFocusNodeId(nodeId);
    return true;
  });
  // 订阅回调里回写页面状态，用 ref 避免 chatConfig 变化导致重新订阅。
  const onChatConfigChangeRef = useRef(onChatConfigChange);
  const appDetailChatConfigRef = useRef(appDetailChatConfig);
  useEffect(() => {
    onChatConfigChangeRef.current = onChatConfigChange;
    appDetailChatConfigRef.current = appDetailChatConfig;
  }, [appDetailChatConfig, onChatConfigChange]);

  /**
   * Runtime 的环境事实来源：模型目录与 sandbox 开关。
   * Runtime 每轮派生同步调用且不缓存，因此这里只读已就绪的 store 快照，不发请求。
   */
  const getEnvironment = useMemoizedFn(
    (): WorkflowEnvironment => ({
      models: peekWorkflowEnvironmentModels(),
      sandbox: { configured: !!showSandbox, planSupported: enableSandbox }
    })
  );

  const bumpView = useMemoizedFn(() => {
    setViewTick((tick) => tick + 1);
  });

  const setVersions = useMemoizedFn((next: WorkflowVersionEntry[]) => {
    versionsRef.current = next;
    setVersionsRaw(next);
  });

  const recordVersionHistory = useMemoizedFn((current: WorkflowRuntimePort) => {
    setVersions(recordWorkflowVersion({ current, versions: versionsRef.current }));
  });

  /** undo/redo 只移动当前版本标记，不新增侧边栏记录。 */
  const syncLiveVersion = useMemoizedFn((current: WorkflowRuntimePort) => {
    const next = syncWorkflowLiveVersion({ current, versions: versionsRef.current });
    if (next) setVersions(next);
  });

  const teardownRuntime = useMemoizedFn(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = undefined;
    if (runtimeRef.current && !runtimeRef.current.isDisposed()) {
      runtimeRef.current.dispose();
    }
    runtimeRef.current = null;
  });

  const attachRuntime = useMemoizedFn((next: WorkflowRuntimePort) => {
    teardownRuntime();
    runtimeRef.current = next;
    unsubscribeRef.current = next.subscribe((change) => {
      // undo/redo/replace 恢复文档 chatConfig 时回写 appDetail。
      if (change.changedRecords.chatConfig && !next.isDisposed()) {
        // snapshot 是 DeepReadonly；appDetail 需要可变类型，这里只做引用替换不修改内容。
        const nextConfig = AppChatConfigTypeSchema.parse(next.getWorkflow().chatConfig);
        if (!isEqual(appDetailChatConfigRef.current, nextConfig)) {
          appDetailChatConfigRef.current = nextConfig;
          onChatConfigChangeRef.current?.(nextConfig);
        }
      }
      if (change.origin === 'command' && !suppressVersionHistoryRef.current) {
        recordVersionHistory(next);
      } else if (change.origin !== 'command') {
        syncLiveVersion(next);
      }
      notifyHost();
    });
    setRuntime(next);
  });

  useEffect(() => {
    if (!initialRuntime || runtimeRef.current === initialRuntime) return;
    attachRuntime(initialRuntime);
    overlaysRef.current = {};
    updateIssueFocusNode(undefined);
    pendingSaveRevision.current = undefined;
    setVersions([
      {
        title: t('app:app.version_initial'),
        contentRevision: initialRuntime.getSavepoint().contentRevision,
        live: true
      }
    ]);
    bumpView();
  }, [attachRuntime, bumpView, initialRuntime, setVersions, t, updateIssueFocusNode]);

  // SystemConfigDrawer 只写 appDetail.chatConfig；这里单向同步进文档（相等时跳过，避免死循环）。
  useEffect(() => {
    const current = runtimeRef.current;
    if (appDetailChatConfig === undefined || !current || current.isDisposed()) return;
    const docConfig = current.getWorkflow().chatConfig;
    if (!isEqual(docConfig, appDetailChatConfig)) {
      current.dispatch({ type: 'updateChatConfig', chatConfig: appDetailChatConfig });
    }
  }, [runtime, appDetailChatConfig]);

  // 命令提交、undo/redo 与 Savepoint 回填都通过 host 重渲染刷新下列派生状态。
  const history = runtime && !runtime.isDisposed() ? runtime.getHistory() : undefined;
  const isSaved = !runtime || runtime.isDisposed() ? true : !runtime.getSavepoint().isDirty;

  /**
   * 问题焦点：标红哪个节点由 host 单点持有（旧行为同一时刻只标红一个），投影合并进节点 data。
   * 传入 nodeId 时更新焦点序号，画布在尺寸进入 Dimension Index 后负责定位；传 undefined 只清除
   * 标红，用于节点被点击或取消选中的场景，此时不应移动视口。
   */
  const focusIssueNode = useMemoizedFn((nodeId?: string) => {
    if (updateIssueFocusNode(nodeId)) {
      setIssueFocusTick((tick) => tick + 1);
      bumpView();
    }
  });

  const serializeWorkflow = useMemoizedFn(() =>
    serializeWorkflowData({
      runtimeRef,
      pendingSaveRevisionRef: pendingSaveRevision
    })
  );

  const serializeWorkflowAndCheck = useMemoizedFn((hideTip = false) =>
    serializeWorkflowAndCheckData({
      runtimeRef,
      pendingSaveRevisionRef: pendingSaveRevision,
      hideTip,
      toast,
      t,
      focusIssueNode
    })
  );

  const markSaved = useMemoizedFn(() =>
    markWorkflowSaved({
      runtimeRef,
      pendingSaveRevisionRef: pendingSaveRevision,
      notifyHost
    })
  );

  const initRuntime = useMemoizedFn((content: CanonicalWorkflowData) => {
    // Issue View 由 Runtime 按文档规则与环境事实算出；Workflow 与 Plugin host 共用这一份接线。
    const nextRuntime = hydrateWorkflowEditor(content, { getEnvironment });
    attachRuntime(nextRuntime);
    overlaysRef.current = {};
    updateIssueFocusNode(undefined);
    pendingSaveRevision.current = undefined;
    const initialTitle = t('app:app.version_initial');
    setVersions([
      {
        title: initialTitle,
        contentRevision: nextRuntime.getSavepoint().contentRevision,
        live: true
      }
    ]);
    // 新建 runtime 会重挂画布订阅，这里 bump 是为了同步清掉上一份 overlay 与标红焦点。
    bumpView();
  });

  /** 导入等重载路径：保留 Runtime 实例与历史（导入可撤销），整文档替换并清视图数据。 */
  const loadDocument = useMemoizedFn((content: CanonicalWorkflowData) => {
    const current = runtimeRef.current;
    if (!current || current.isDisposed()) {
      initRuntime(content);
      return;
    }
    const res = current.dispatch({ type: 'replaceDocument', document: content });
    if (!res.ok) return;
    overlaysRef.current = {};
    updateIssueFocusNode(undefined);
    pendingSaveRevision.current = undefined;
    bumpView();
  });

  /** 版本切换只移动当前版本标记，不产生新的“My Edit”记录。 */
  const switchVersion = useMemoizedFn(
    (entry: WorkflowVersionEntry, _customTitle: string): boolean => {
      const current = runtimeRef.current;
      if (!current || current.isDisposed()) return false;
      if (entry.live) return true;

      // 本地条目按 contentRevision 定位（与 syncLiveVersion 同一把钥匙）：
      // undo/redo 与切换都会重建条目对象，身份比较在调用方持有上一轮条目时会失配。
      const targetIndex =
        entry.contentRevision === undefined
          ? -1
          : versionsRef.current.findIndex((item) => item.contentRevision === entry.contentRevision);
      if (targetIndex >= 0) {
        const liveIndex = versionsRef.current.findIndex((item) => item.live);
        if (liveIndex < 0) return false;
        const direction = targetIndex > liveIndex ? 'undo' : 'redo';
        const res = current.replayHistory(direction, Math.abs(targetIndex - liveIndex));
        if (!res.ok || current.getSavepoint().contentRevision !== entry.contentRevision)
          return false;
      } else {
        // 走到这里说明不是本地条目：只有云端版本带 content，本地条目没有可替换的文档。
        const document = entry.content;
        if (!document) return false;
        // 云端版本不属于本地 Runtime History，只抑制“My Edit”新增记录。
        suppressVersionHistoryRef.current = true;
        const res = (() => {
          try {
            return current.dispatch({ type: 'replaceDocument', document });
          } finally {
            suppressVersionHistoryRef.current = false;
          }
        })();
        if (!res.ok) return false;
      }

      overlaysRef.current = {};
      updateIssueFocusNode(undefined);
      pendingSaveRevision.current = undefined;
      // 文档替换事件已经带动画布投影，但那次投影读到的还是清理前的 overlay 与标红焦点，
      // 这里再 bump 一次让画布按清理后的视图数据重投影。
      bumpView();
      setVersions(
        versionsRef.current.map((item) => ({
          ...item,
          live:
            entry.contentRevision !== undefined
              ? item.contentRevision === entry.contentRevision
              : item === entry
        }))
      );
      // 云端整文档替换后按替换结果同步一次 chatConfig；
      // 本地条目走 replayHistory，chatConfig 变化已由 Runtime 变更事件回写 appDetail。
      if (entry.content) {
        const nextChatConfig = entry.content.chatConfig;
        onChatConfigChangeRef.current?.(nextChatConfig);
      }
      return true;
    }
  );

  const switchCloudVersion = useMemoizedFn((appVersion: AppVersionSchemaType) => {
    // 云端版本是存量 store 数据，必须走与打开工作流相同的入站边界（migration + 物化）。
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
    return switchVersion({ title, content }, title);
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
   * 目录冷启动由这里 ensure 一次（旧路径靠定时扫描顺带加载），之后的变化订阅 modelList 引用；
   * ensureModelCatalog 的凭证校验在 store 写入之后的微任务里完成，订阅回调因此延后一个宏任务再重算，
   * 否则 peek 到的仍是未校验目录。
   */
  useEffect(() => {
    if (!runtime) return;
    let timer: number | undefined;
    const unsubscribe = useUserModelStore.subscribe((state, prev) => {
      if (state.modelList === prev.modelList) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(refreshIssues, 0);
    });
    void ensureModelCatalog()
      .then(refreshIssues)
      .catch(() => undefined);
    // 挂载与 sandbox 开关变化都走到这里：环境事实已经不同，直接重算一轮。
    refreshIssues();

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [runtime, refreshIssues, showSandbox, enableSandbox]);

  // 本地草稿、beforeunload 与卸载自动保存、鉴权过期草稿。
  const { authExpiredModal } = useWorkflowDraftLifecycle({
    isSaved,
    serializeWorkflow,
    leaveSaveSign
  });

  // 必须声明在草稿生命周期之后：卸载清理按声明顺序执行，自动保存要先于 Runtime 释放。
  useEffect(
    () => () => {
      teardownRuntime();
    },
    [teardownRuntime]
  );

  const sessionActions = useMemo<WorkflowSessionActions>(
    () => ({ initRuntime, loadDocument }),
    [initRuntime, loadDocument]
  );
  const persistence = useMemo<WorkflowPersistenceState>(
    () => ({
      isSaved,
      serializeWorkflow,
      serializeWorkflowAndCheck,
      markSaved,
      leaveSaveSign
    }),
    [isSaved, serializeWorkflow, serializeWorkflowAndCheck, markSaved]
  );
  const historyState = useMemo<WorkflowHistoryState>(
    () => ({
      undo,
      redo,
      canUndo: history?.canUndo ?? false,
      canRedo: history?.canRedo ?? false,
      versions,
      switchVersion,
      switchCloudVersion
    }),
    [undo, redo, history?.canUndo, history?.canRedo, versions, switchVersion, switchCloudVersion]
  );

  const value: WorkflowSessionValue = useMemo(
    () => ({
      runtime,
      editorSessionId,
      viewTick,
      issueFocusTick,
      overlaysRef,
      patchViewData,
      undo,
      redo,
      canUndo: history?.canUndo ?? false,
      canRedo: history?.canRedo ?? false,
      versions,
      switchVersion,
      switchCloudVersion,
      isSaved,
      leaveSaveSign,
      serializeWorkflow,
      serializeWorkflowAndCheck,
      markSaved,
      issueFocusNodeId,
      issueFocusRef,
      focusIssueNode,
      initRuntime,
      loadDocument,
      sessionActions,
      persistence,
      historyState
    }),
    [
      runtime,
      editorSessionId,
      viewTick,
      issueFocusTick,
      patchViewData,
      undo,
      redo,
      history?.canUndo,
      history?.canRedo,
      versions,
      switchVersion,
      switchCloudVersion,
      isSaved,
      serializeWorkflow,
      serializeWorkflowAndCheck,
      markSaved,
      issueFocusNodeId,
      focusIssueNode,
      initRuntime,
      loadDocument,
      sessionActions,
      persistence,
      historyState
    ]
  );

  return (
    <WorkflowSessionContext.Provider value={value}>
      <WorkflowEditorProvider runtime={runtime}>
        {children}
        {authExpiredModal}
      </WorkflowEditorProvider>
    </WorkflowSessionContext.Provider>
  );
};
