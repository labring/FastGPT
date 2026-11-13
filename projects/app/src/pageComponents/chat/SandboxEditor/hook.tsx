import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import SandboxEditorModal from '@/pageComponents/chat/SandboxEditor/modal';
import type { IconButtonProps } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  checkSandboxExist,
  deleteSandboxEntry,
  downloadSandbox,
  execSandboxCommand,
  getFilePreviewLink,
  listSandboxDirectory,
  mkdirSandboxDirectory,
  moveSandboxEntry,
  readSandboxFile,
  uploadSandboxFile
} from './api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useContextSelector } from 'use-context-selector';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useLatest } from 'ahooks';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { TreeNode } from './components/FileTree';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';
import {
  getSandboxTargetId,
  tryResolveSandboxTarget,
  type CreateSandboxNodeParams,
  type OpenedFile
} from './types';
import {
  getLanguageByFileName,
  getIsBinaryByLanguage,
  addTreeNode,
  deleteTreeNode,
  moveTreeNodeInTree,
  renameTreeNodeInTree,
  findNodeByPath,
  sortTreeNodes,
  updateTreeNode,
  replacePathPrefix,
  getSandboxPathName,
  getSandboxParentPath,
  joinSandboxPath,
  applySandboxMoveOperationsToExpandedDirs,
  type SandboxMoveOperation,
  SANDBOX_WORKSPACE_REFRESH_EVENT
} from './utils';

const SYSTEM_FILE_NAMES = ['.DS_Store'];
const DEFAULT_MAX_FILE_SIZE_MB = 10;
const INVALID_PATH_SEGMENT_CHARS = /[\/\\\u0000]/;
const MAX_EDITABLE_TEXT_FILE_BYTES = 5 * 1024 * 1024;
const FILE_PREVIEW_EXPIRY_MARGIN_MS = 30 * 1000;

type RefreshWorkspaceOptions = {
  preserveExpandedDirs?: boolean;
};

type LoadFileResult = {
  content: string;
  isUnknown: boolean;
  etag?: string;
  readOnly?: boolean;
};

const isValidPathSegment = (name: string) =>
  !!name && name !== '.' && name !== '..' && !INVALID_PATH_SEGMENT_CHARS.test(name);

const isNotFoundResponseError = (reason: unknown) =>
  typeof reason === 'object' &&
  reason !== null &&
  ((reason as { status?: unknown }).status === 404 || (reason as { code?: unknown }).code === 404);

const isConflictSaveError = (reason: unknown) =>
  typeof reason === 'object' &&
  reason !== null &&
  ((reason as { code?: unknown }).code === 409 || (reason as { status?: unknown }).status === 409);

/**
 * useSandboxEditor —— UI Hook
 *
 * 职责：仅负责渲染 SandboxEditorModal 弹窗及其开关逻辑。
 */
export const useSandboxEditor = ({
  appId,
  chatTarget,
  chatId,
  outLinkAuthData,
  afterClose,
  enabled = true,
  showFileOps = false,
  showDownload = true
}: {
  appId?: string;
  chatTarget?: ChatTargetInputType;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  afterClose?: () => void;
  enabled?: boolean;
  showFileOps?: boolean;
  showDownload?: boolean;
}) => {
  const [sandboxModalOpen, setSandboxModalOpen] = useState(false);
  const sandboxTarget = useMemo(
    () => (enabled ? tryResolveSandboxTarget({ appId, chatTarget }) : undefined),
    [appId, chatTarget, enabled]
  );

  const onOpenSandboxModal = useCallback(() => {
    if (!sandboxTarget) return;
    setSandboxModalOpen(true);
  }, [sandboxTarget]);

  const onCloseSandboxModal = useCallback(() => {
    setSandboxModalOpen(false);
    afterClose?.();
  }, [afterClose]);

  const SandboxEditorModalDom = useCallback(() => {
    return sandboxModalOpen && sandboxTarget ? (
      <SandboxEditorModal
        onClose={onCloseSandboxModal}
        chatTarget={sandboxTarget}
        chatId={chatId}
        outLinkAuthData={outLinkAuthData}
        showFileOps={showFileOps}
        showDownload={showDownload}
      />
    ) : null;
  }, [
    sandboxModalOpen,
    onCloseSandboxModal,
    sandboxTarget,
    chatId,
    outLinkAuthData,
    showFileOps,
    showDownload
  ]);

  return {
    SandboxEditorModal: SandboxEditorModalDom,
    onOpenSandboxModal,
    onCloseSandboxModal
  };
};

/**
 * useSandboxStatus —— Status Hook
 *
 * 职责：负责 checkSandboxExist 的网络同步及 SandboxEntryIcon 的显示控制。
 */
export const useSandboxStatus = ({
  appId,
  chatTarget,
  chatId,
  outLinkAuthData,
  enabled = true
}: {
  appId?: string;
  chatTarget?: ChatTargetInputType;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  enabled?: boolean;
}) => {
  const { t } = useTranslation();
  const [apiSandboxStatus, setApiSandboxStatus] = useState({
    targetId: '',
    chatId: '',
    exists: false
  });
  const sandboxTarget = useMemo(
    () => (enabled ? tryResolveSandboxTarget({ appId, chatTarget }) : undefined),
    [appId, chatTarget, enabled]
  );
  const sandboxTargetId = sandboxTarget ? getSandboxTargetId(sandboxTarget) : '';

  const chatRecords = useContextSelector(ChatRecordContext, (v) => {
    return v.chatRecords;
  });
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);

  const hasSandboxInHistory = useMemo(() => {
    if (!isChatRecordsLoaded) return false;
    return chatRecords.some((record) => {
      const enriched = addStatisticalDataToHistoryItem(record);
      return enriched.useAgentSandbox === true;
    });
  }, [chatRecords, isChatRecordsLoaded]);

  useEffect(() => {
    if (!sandboxTarget || !sandboxTargetId || !chatId) return;
    let cancelled = false;
    checkSandboxExist({ ...sandboxTarget, chatId, outLinkAuthData })
      .then((result) => {
        if (!cancelled)
          setApiSandboxStatus({
            targetId: sandboxTargetId,
            chatId,
            exists: result.exists
          });
      })
      .catch((error) => {
        console.error('Failed to check sandbox status:', error);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sandboxTarget,
    sandboxTargetId,
    chatId,
    outLinkAuthData?.shareId,
    outLinkAuthData?.outLinkUid
  ]);

  const apiSandboxExists =
    apiSandboxStatus.targetId === sandboxTargetId &&
    apiSandboxStatus.chatId === chatId &&
    apiSandboxStatus.exists;
  const sandboxExists = !!sandboxTarget && (apiSandboxExists || hasSandboxInHistory);
  const { onOpenSandbox } = useSandboxOpenGuard({
    appId,
    chatTarget,
    chatId,
    outLinkAuthData,
    enabled
  });

  const setSandboxExists = useCallback(
    (exists: boolean) => {
      setApiSandboxStatus({ targetId: sandboxTargetId, chatId, exists });
    },
    [sandboxTargetId, chatId]
  );

  const SandboxEntryIcon = useCallback(
    ({
      onOpen,
      ...props
    }: Omit<IconButtonProps, 'name' | 'onClick' | 'aria-label'> & { onOpen: () => void }) => {
      if (!sandboxExists) return null;

      return (
        <MyTooltip label={t('chat:sandbox_entry_tooltip')}>
          <IconButton
            variant={'whiteBase'}
            size={'smSquare'}
            color={'myGray.600'}
            _hover={{
              color: 'primary.600'
            }}
            icon={
              <MyIcon
                name={'core/chat/monitor'}
                w={'16px'}
                color={'currentColor'}
                sx={{
                  '& path': {
                    fill: 'currentColor'
                  }
                }}
              />
            }
            onClick={() => void onOpenSandbox(onOpen)}
            {...props}
            aria-label={t('chat:sandbox_entry_tooltip')}
          />
        </MyTooltip>
      );
    },
    [sandboxExists, t, onOpenSandbox]
  );

  return {
    sandboxExists,
    setSandboxExists,
    onOpenSandbox,
    SandboxEntryIcon
  };
};

/**
 * 创建统一的 Sandbox 入口点击守卫。
 */
export const useSandboxOpenGuard = ({
  appId,
  chatTarget,
  chatId,
  outLinkAuthData,
  enabled = true
}: {
  appId?: string;
  chatTarget?: ChatTargetInputType;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  enabled?: boolean;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const sandboxTarget = useMemo(
    () => (enabled ? tryResolveSandboxTarget({ appId, chatTarget }) : undefined),
    [appId, chatTarget, enabled]
  );

  const onOpenSandbox = useCallback(
    async (onOpen: () => void) => {
      if (!sandboxTarget || !chatId) return false;

      try {
        const status = await checkSandboxExist({ ...sandboxTarget, chatId, outLinkAuthData });
        if (status.unavailableReason) {
          toast({
            status: 'warning',
            title: t('chat:sandbox_unavailable_toast')
          });
          return false;
        }

        onOpen();
        return true;
      } catch (error) {
        console.error('Failed to check sandbox status:', error);
        onOpen();
        return true;
      }
    },
    [sandboxTarget, chatId, outLinkAuthData, t, toast]
  );

  return { onOpenSandbox };
};

/**
 * useSandboxFileStore —— File Management Hook
 *
 * 职责：整合 Sandbox 的文件树（depth=1 按需懒加载）与 Tab 状态，对接主站 `/api/core/ai/sandbox/fs/*` 路由。
 */
export const useSandboxFileStore = ({
  sandboxTarget,
  chatId,
  outLinkAuthData,
  isPreparing = false,
  canWrite = true,
  onError
}: {
  sandboxTarget: ChatTargetInputType;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  isPreparing?: boolean;
  canWrite?: boolean;
  onError?: (err: Error) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const sandboxTargetId = getSandboxTargetId(sandboxTarget);
  const [maxFileBytes, setMaxFileBytes] = useState(DEFAULT_MAX_FILE_SIZE_MB * 1024 * 1024);
  const [sessionWorkDirectory, setSessionWorkDirectory] = useState('');
  const maxFileSizeMB = Math.ceil(maxFileBytes / 1024 / 1024);

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [loadingRoot, setLoadingRoot] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);

  // 多标签页状态与选中节点路径状态
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [conflictPaths, setConflictPaths] = useState<string[]>([]);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  const openedFilesRef = useLatest(openedFiles);
  const activeFilePathRef = useLatest(activeFilePath);
  const fileTreeRef = useLatest(fileTree);
  const expandedDirsRef = useLatest(expandedDirs);
  const loadingFilePathsRef = useRef<Set<string>>(new Set());
  const isRefreshingWorkspaceRef = useRef(false);
  const hasPendingWorkspaceRefreshRef = useRef(false);
  const saveFileQueuesRef = useRef<Map<string, Promise<{ etag?: string } | undefined>>>(new Map());
  const filePreviewLinksRef = useRef(
    new Map<string, Awaited<ReturnType<typeof getFilePreviewLink>>>()
  );
  const pendingFilePreviewsRef = useRef(new Map<string, ReturnType<typeof getFilePreviewLink>>());
  const sessionKey = `${sandboxTarget.appId ?? ''}:${sandboxTarget.skillId ?? ''}:${chatId}`;
  const [stateSessionKey, setStateSessionKey] = useState(sessionKey);
  const isSessionStateSyncedRef = useLatest(stateSessionKey === sessionKey);
  const workspaceEpochRef = useRef(0);
  const prevSessionKeyRef = useRef(sessionKey);
  const prevIsPreparingRef = useRef(isPreparing);
  const previewContextKey = JSON.stringify([
    sandboxTargetId,
    chatId,
    outLinkAuthData?.shareId,
    outLinkAuthData?.outLinkUid
  ]);

  const resetWorkspaceRuntimeState = useCallback(
    (nextSessionKey?: string) => {
      workspaceEpochRef.current += 1;
      saveFileQueuesRef.current = new Map();
      loadingFilePathsRef.current.clear();
      isRefreshingWorkspaceRef.current = false;
      hasPendingWorkspaceRefreshRef.current = false;

      if (nextSessionKey !== undefined) {
        setStateSessionKey(nextSessionKey);
      }
      setConflictPaths([]);
      setIsResolvingConflict(false);
      setOpenedFiles([]);
      setActiveFilePath('');
      setSelectedPath('');
      setFileTree([]);
      setExpandedDirs(new Set());
      setLoadingDirs(new Set());
      setLoadingRoot(false);
      setIsWorkspaceLoaded(false);
      setSessionWorkDirectory('');
    },
    [
      setActiveFilePath,
      setConflictPaths,
      setExpandedDirs,
      setFileTree,
      setIsResolvingConflict,
      setIsWorkspaceLoaded,
      setLoadingDirs,
      setLoadingRoot,
      setOpenedFiles,
      setSelectedPath,
      setSessionWorkDirectory,
      setStateSessionKey
    ]
  );

  // 切换会话或目标（appId / skillId / chatId）时推进 epoch 并重置全部工作区状态，
  // 防止上一个会话的未保存脏文件、在途目录/文件请求或排队保存写回新会话。
  useEffect(() => {
    if (prevSessionKeyRef.current === sessionKey) return;
    prevSessionKeyRef.current = sessionKey;
    resetWorkspaceRuntimeState(sessionKey);
  }, [resetWorkspaceRuntimeState, sessionKey]);

  // 同一会话内重新进入沙盒准备/重建（false -> true）时，同步推进 epoch 并清空排队保存与页签状态。
  useEffect(() => {
    const wasPreparing = prevIsPreparingRef.current;
    prevIsPreparingRef.current = isPreparing;
    if (!wasPreparing && isPreparing) {
      resetWorkspaceRuntimeState();
    }
  }, [isPreparing, resetWorkspaceRuntimeState]);

  useEffect(() => {
    // 使用新 Map，防止旧鉴权请求完成后把链接写回新上下文。
    filePreviewLinksRef.current = new Map();
    pendingFilePreviewsRef.current = new Map();
  }, [previewContextKey]);

  const closeOpenedFileByPath = useCallback(
    (filePath: string, options?: { clearSelectedPath?: boolean }) => {
      setConflictPaths((prev) => prev.filter((item) => item !== filePath));
      setOpenedFiles((prev) => {
        const next = prev.filter((file) => file.path !== filePath);

        setActiveFilePath((current) => {
          if (current !== filePath) return current;
          return next.length > 0 ? next[next.length - 1].path : '';
        });

        if (options?.clearSelectedPath !== false) {
          setSelectedPath((current) => (current === filePath ? '' : current));
        }

        return next;
      });
    },
    [setActiveFilePath, setConflictPaths, setOpenedFiles, setSelectedPath]
  );

  // 读取单个目录（depth=1 懒加载）并转换为排序后的 TreeNode 列表
  const fetchDirectoryNodes = useCallback(
    async (path: string, level: number): Promise<TreeNode[]> => {
      const epoch = workspaceEpochRef.current;
      const res = await listSandboxDirectory({
        ...sandboxTarget,
        chatId,
        outLinkAuthData,
        path
      });
      if (workspaceEpochRef.current === epoch) {
        if (typeof res.maxFileBytes === 'number' && res.maxFileBytes > 0) {
          setMaxFileBytes(res.maxFileBytes);
        }
        if (typeof res.sessionWorkDirectory === 'string' && res.sessionWorkDirectory) {
          setSessionWorkDirectory(res.sessionWorkDirectory);
        }
      }

      const filtered = (res.entries ?? []).filter((item) => !SYSTEM_FILE_NAMES.includes(item.name));
      const nodes: TreeNode[] = filtered.map((file) => ({
        name: file.name,
        path: file.path,
        type: file.type,
        size: file.size,
        mtime: file.mtime,
        level,
        children: file.type === 'directory' ? [] : undefined,
        loaded: false
      }));

      return sortTreeNodes(nodes);
    },
    [chatId, outLinkAuthData, sandboxTarget, setMaxFileBytes, setSessionWorkDirectory]
  );

  /** 媒体复用未过期的代理链接；文本严格按 UTF-8 解码，超过 5 MiB 时仅供预览。 */
  const loadFile = useCallback(
    async ({
      filePath,
      language,
      mediaVersion
    }: {
      filePath: string;
      language: string;
      mediaVersion?: string;
    }): Promise<LoadFileResult> => {
      if (getIsBinaryByLanguage(language)) {
        // 复用同一预览凭证，仅在文件版本变化时改变 src，让浏览器重新请求媒体内容。
        const getMediaUrl = (url: string) => {
          if (mediaVersion === undefined) return url;
          const versioned = new URL(url);
          versioned.searchParams.set('_sandboxVersion', mediaVersion);
          return versioned.toString();
        };
        const cacheKey = JSON.stringify([previewContextKey, filePath]);
        const links = filePreviewLinksRef.current;
        const pending = pendingFilePreviewsRef.current;
        const cached = links.get(cacheKey);
        if (cached && cached.expiresAt > Date.now() + FILE_PREVIEW_EXPIRY_MARGIN_MS) {
          return { content: getMediaUrl(cached.url), isUnknown: false };
        }

        // 并发打开或刷新同一媒体时共享签发请求，避免消耗额外的预览令牌。
        const request =
          pending.get(cacheKey) ??
          getFilePreviewLink({
            ...sandboxTarget,
            chatId,
            outLinkAuthData,
            filePath
          });
        pending.set(cacheKey, request);
        try {
          const preview = await request;
          links.set(cacheKey, preview);
          return { content: getMediaUrl(preview.url), isUnknown: false };
        } finally {
          if (pending.get(cacheKey) === request) {
            pending.delete(cacheKey);
          }
        }
      }

      const { bytes, etag, size } = await readSandboxFile({
        ...sandboxTarget,
        chatId,
        outLinkAuthData,
        path: filePath
      });
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return {
          content,
          isUnknown: false,
          etag,
          readOnly: size > MAX_EDITABLE_TEXT_FILE_BYTES
        };
      } catch {
        // 无法严格解码的文件不进入文本编辑器，避免保存时损坏原始字节。
        return { content: '', isUnknown: true, etag };
      }
    },
    [chatId, outLinkAuthData, previewContextKey, sandboxTarget]
  );

  /** 移动成功后刷新媒体路径及代理链接；签发失败不回滚已完成的文件操作，后续刷新可重试。 */
  const reloadMovedMediaPreviews = useCallback(
    async (files: OpenedFile[], { from, to }: { from: string; to: string }) => {
      const movedMedia = files.filter(
        (file) => file.isBinary && replacePathPrefix(file.path, from, to) !== file.path
      );
      await Promise.all(
        movedMedia.map(async (file) => {
          const newPath = replacePathPrefix(file.path, from, to);
          for (const path of [file.path, newPath]) {
            const cacheKey = JSON.stringify([previewContextKey, path]);
            filePreviewLinksRef.current.delete(cacheKey);
            pendingFilePreviewsRef.current.delete(cacheKey);
          }

          const result = await loadFile({ filePath: newPath, language: file.language }).catch(
            (error): LoadFileResult => {
              console.error('Failed to reload moved media preview:', error);
              return { content: '', isUnknown: false };
            }
          );
          setOpenedFiles((prev) =>
            prev.map((current) =>
              current.path === newPath && current.content === file.content
                ? { ...current, ...result, isLoading: false }
                : current
            )
          );
        })
      );
    },
    [loadFile, previewContextKey, setOpenedFiles]
  );

  // 加载目录
  const loadDirectory = useCallback(
    async (path: string, level: number) => {
      const epoch = workspaceEpochRef.current;
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });

      try {
        const sortedNodes = await fetchDirectoryNodes(path, level);
        if (workspaceEpochRef.current !== epoch) {
          return [];
        }
        setFileTree((prevTree) => {
          if (level === 0) {
            return sortedNodes;
          }
          return updateTreeNode(prevTree, path, sortedNodes, true);
        });
        return sortedNodes;
      } catch (error) {
        if (workspaceEpochRef.current === epoch) {
          toast({
            title: t('chat:sandbox_load_failed'),
            description: getErrText(error),
            status: 'error'
          });
        }
        throw error;
      } finally {
        if (workspaceEpochRef.current === epoch) {
          setLoadingDirs((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
      }
    },
    [fetchDirectoryNodes, toast, t, setLoadingDirs, setFileTree]
  );

  // 刷新工作区（仅按需加载根目录 + 当前已展开的目录，严禁深层递归扫描）
  const refreshWorkspace = useCallback(
    async (options: RefreshWorkspaceOptions = {}) => {
      const epoch = workspaceEpochRef.current;
      if (isRefreshingWorkspaceRef.current) {
        hasPendingWorkspaceRefreshRef.current = true;
        return;
      }

      // 仅在服务端明确返回 404 或父目录已加载且确认节点缺失时关闭页签，避免折叠目录下的页签因瞬态故障被误关。
      const isNotFoundError = isNotFoundResponseError;

      const isParentDirectoryLoaded = (tree: TreeNode[] | null, filePath: string) => {
        if (!tree) return false;
        const parentPath = getSandboxParentPath(filePath);
        if (parentPath === '.') return true;
        const parentNode = findNodeByPath(tree, parentPath);
        return Boolean(parentNode && parentNode.type === 'directory' && parentNode.loaded);
      };

      isRefreshingWorkspaceRef.current = true;
      try {
        let refreshOptions = options;
        do {
          hasPendingWorkspaceRefreshRef.current = false;
          const getLiveExpandedDirs = () =>
            isSessionStateSyncedRef.current
              ? (expandedDirsRef.current ?? new Set<string>())
              : new Set<string>();
          const getLiveFileTree = () =>
            isSessionStateSyncedRef.current ? (fileTreeRef.current ?? []) : [];
          const getLiveOpenedFiles = () =>
            isSessionStateSyncedRef.current ? (openedFilesRef.current ?? []) : [];

          const initialExpandedSnapshot = new Set(getLiveExpandedDirs());
          const shouldShowLoadingRoot = getLiveFileTree().length === 0;
          if (shouldShowLoadingRoot) {
            setLoadingRoot(true);
          }
          let latestFileTree: TreeNode[] | null = null;

          try {
            let nextTree = await fetchDirectoryNodes('.', 0);
            if (workspaceEpochRef.current !== epoch) return;

            const loadedExpanded = new Set<string>();
            const attemptedExpanded = new Set<string>();

            // 合并刷新期间用户新展开的目录，避免在途刷新覆盖 toggleDirectory 的展开结果。
            while (true) {
              const liveExpanded = getLiveExpandedDirs();
              const candidatePaths = Array.from(liveExpanded)
                .filter((dirPath) => {
                  if (attemptedExpanded.has(dirPath)) return false;
                  return (
                    Boolean(refreshOptions.preserveExpandedDirs) ||
                    !initialExpandedSnapshot.has(dirPath)
                  );
                })
                .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

              if (candidatePaths.length === 0) break;

              for (const dirPath of candidatePaths) {
                attemptedExpanded.add(dirPath);
                const node = findNodeByPath(nextTree, dirPath);
                if (!node || node.type !== 'directory') continue;
                try {
                  const childNodes = await fetchDirectoryNodes(dirPath, node.level + 1);
                  if (workspaceEpochRef.current !== epoch) return;
                  nextTree = updateTreeNode(nextTree, dirPath, childNodes, true);
                  if (getLiveExpandedDirs().has(dirPath)) {
                    loadedExpanded.add(dirPath);
                  }
                } catch {}
              }
            }

            latestFileTree = nextTree;
            setFileTree(nextTree);
            setExpandedDirs(new Set(loadedExpanded));
            setIsWorkspaceLoaded(true);
          } catch (error) {
            if (workspaceEpochRef.current !== epoch) return;
            console.error('Failed to refresh sandbox workspace:', error);
            if (getLiveFileTree().length === 0) {
              onError?.(error instanceof Error ? error : new Error(getErrText(error)));
            }
          } finally {
            if (shouldShowLoadingRoot && workspaceEpochRef.current === epoch) {
              setLoadingRoot(false);
            }
          }

          if (workspaceEpochRef.current !== epoch) return;

          if (!hasPendingWorkspaceRefreshRef.current) {
            const filesToReload = getLiveOpenedFiles()
              .filter((f) => !f.isDirty && !f.isSaving && !f.isLoading && !f.isUnknown)
              .map((f) => ({
                path: f.path,
                language: f.language,
                content: f.content,
                etag: f.etag
              }));

            if (filesToReload.length > 0) {
              const reloadResults = await Promise.allSettled(
                filesToReload.map(async (f) => {
                  const node = latestFileTree && findNodeByPath(latestFileTree, f.path);
                  const mediaVersion =
                    typeof node?.mtime === 'number' || typeof node?.size === 'number'
                      ? `${node?.mtime ?? ''}-${node?.size ?? ''}`
                      : undefined;
                  const { content, isUnknown, etag, readOnly } = await loadFile({
                    filePath: f.path,
                    language: f.language,
                    mediaVersion
                  });
                  return { content, isUnknown, etag, readOnly };
                })
              );

              if (workspaceEpochRef.current !== epoch) return;

              const updates = new Map<
                string,
                {
                  content: string;
                  isUnknown: boolean;
                  etag?: string;
                  readOnly?: boolean;
                }
              >();
              const snapshots = new Map(
                filesToReload.map((f) => [f.path, { content: f.content, etag: f.etag }])
              );
              reloadResults.forEach((result, idx) => {
                const f = filesToReload[idx];
                if (result.status === 'fulfilled') {
                  updates.set(f.path, result.value);
                } else if (
                  isNotFoundError(result.reason) ||
                  (isParentDirectoryLoaded(latestFileTree, f.path) &&
                    latestFileTree &&
                    !findNodeByPath(latestFileTree, f.path))
                ) {
                  closeOpenedFileByPath(f.path);
                }
              });

              if (updates.size > 0) {
                setOpenedFiles((prev) =>
                  prev.map((item) => {
                    const update = updates.get(item.path);
                    const snapshot = snapshots.get(item.path);
                    if (
                      update &&
                      snapshot &&
                      !item.isDirty &&
                      !item.isSaving &&
                      item.content === snapshot.content &&
                      item.etag === snapshot.etag
                    ) {
                      return {
                        ...item,
                        content: update.content,
                        isUnknown: update.isUnknown,
                        etag: update.etag,
                        readOnly: update.readOnly,
                        isDirty: false
                      };
                    }
                    return item;
                  })
                );
              }
            }
          }

          refreshOptions = { preserveExpandedDirs: true };
        } while (hasPendingWorkspaceRefreshRef.current && workspaceEpochRef.current === epoch);
      } finally {
        if (workspaceEpochRef.current === epoch) {
          isRefreshingWorkspaceRef.current = false;
        }
      }
    },
    [
      expandedDirsRef,
      fileTreeRef,
      fetchDirectoryNodes,
      isSessionStateSyncedRef,
      openedFilesRef,
      closeOpenedFileByPath,
      loadFile,
      onError
    ]
  );

  const refreshWorkspaceRef = useLatest(refreshWorkspace);

  /** 仅在焦点从编辑器外部移入时刷新工作区；内部树节点、标签页与编辑器间切换焦点不重复触发。 */
  const onWorkspaceFocus = useCallback(
    (e?: React.FocusEvent<HTMLElement>) => {
      if (e?.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
      }
      void refreshWorkspaceRef.current?.({ preserveExpandedDirs: true });
    },
    [refreshWorkspaceRef]
  );

  // 初始化加载 + 监听窗口聚焦与外部刷新事件（Tool Call / 终端命令结束）
  useEffect(() => {
    if (!sandboxTargetId || !chatId || isPreparing) return;

    void refreshWorkspaceRef.current?.();

    const handleRefreshEvent = () => {
      void refreshWorkspaceRef.current?.({ preserveExpandedDirs: true });
    };

    window.addEventListener('focus', handleRefreshEvent);
    window.addEventListener(SANDBOX_WORKSPACE_REFRESH_EVENT, handleRefreshEvent);

    return () => {
      window.removeEventListener('focus', handleRefreshEvent);
      window.removeEventListener(SANDBOX_WORKSPACE_REFRESH_EVENT, handleRefreshEvent);
    };
  }, [
    sandboxTarget,
    sandboxTargetId,
    chatId,
    outLinkAuthData?.shareId,
    outLinkAuthData?.outLinkUid,
    isPreparing,
    canWrite,
    refreshWorkspaceRef
  ]);

  // 激活文件变更时，自动同步选中态
  useEffect(() => {
    if (activeFilePath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPath(activeFilePath);
    }
  }, [activeFilePath]);

  const activeFile = useMemo(() => {
    return openedFiles.find((f) => f.path === activeFilePath);
  }, [openedFiles, activeFilePath]);

  /**
   * 保存打开文件的一次内容快照。
   * 保存前标记 `isSaving`，失败时记录 `hasSaveError` 以暂停自动保存重试；
   * 保存期间若用户继续编辑，只推进 etag，不清理 dirty，避免下一轮保存继续携带旧 oldEtag；
   * 当 `forceOverwrite` 为 `true` 时不传 `oldEtag`，用于用户确认覆盖并发修改。
   */
  const saveOpenedFile = useCallback(
    async ({
      targetPath,
      previousSavedEtag,
      forceOverwrite = false,
      epoch = workspaceEpochRef.current
    }: {
      targetPath: string;
      previousSavedEtag?: string;
      forceOverwrite?: boolean;
      epoch?: number;
    }): Promise<{ etag?: string } | undefined> => {
      if (workspaceEpochRef.current !== epoch) return;

      const targetFile = openedFilesRef.current?.find((f) => f.path === targetPath);
      if (
        !targetFile ||
        targetFile.isLoading ||
        targetFile.isBinary ||
        targetFile.isUnknown ||
        targetFile.readOnly
      ) {
        return;
      }

      const savedContent = targetFile.content;
      const snapshotEtag = targetFile.etag;
      const oldEtag = forceOverwrite ? undefined : (previousSavedEtag ?? snapshotEtag);

      setOpenedFiles((prev) =>
        prev.map((f) => (f.path === targetPath ? { ...f, isSaving: true, hasSaveError: false } : f))
      );

      try {
        const res = await uploadSandboxFile({
          ...sandboxTarget,
          chatId,
          outLinkAuthData,
          path: targetPath,
          file: new Blob([savedContent]),
          oldEtag
        });
        if (workspaceEpochRef.current !== epoch) return;

        const newEtag = res.etag;
        setConflictPaths((prev) => prev.filter((item) => item !== targetPath));

        setOpenedFiles((prev) =>
          prev.map((f) => {
            if (f.path !== targetPath) return f;

            const isSameSavedContent = f.content === savedContent;
            const shouldRefreshEtag =
              forceOverwrite || isSameSavedContent || f.etag === snapshotEtag || f.etag === oldEtag;
            if (!shouldRefreshEtag) {
              return { ...f, isSaving: false, hasSaveError: false };
            }

            if (!isSameSavedContent) {
              return { ...f, etag: newEtag, isSaving: false, hasSaveError: false };
            }

            return {
              ...f,
              isDirty: false,
              isSaving: false,
              hasSaveError: false,
              etag: newEtag
            };
          })
        );

        return { etag: newEtag ?? oldEtag };
      } catch (error) {
        if (workspaceEpochRef.current === epoch) {
          setOpenedFiles((prev) =>
            prev.map((f) =>
              f.path === targetPath ? { ...f, isSaving: false, hasSaveError: true } : f
            )
          );
        }
        throw error;
      }
    },
    [chatId, openedFilesRef, outLinkAuthData, sandboxTarget, setConflictPaths, setOpenedFiles]
  );

  /**
   * 同一路径的写入必须串行化；切换会话后自动丢弃旧会话的排队写入。
   */
  const enqueueSaveFile = useCallback(
    (targetPath: string, options?: { forceOverwrite?: boolean }) => {
      const epoch = workspaceEpochRef.current;
      const previousTask = saveFileQueuesRef.current.get(targetPath);
      const currentTask = (async () => {
        const previousResult = await previousTask?.catch(() => undefined);
        if (workspaceEpochRef.current !== epoch) return undefined;
        return saveOpenedFile({
          targetPath,
          previousSavedEtag: options?.forceOverwrite ? undefined : previousResult?.etag,
          forceOverwrite: options?.forceOverwrite,
          epoch
        });
      })();

      saveFileQueuesRef.current.set(targetPath, currentTask);
      void currentTask
        .finally(() => {
          if (saveFileQueuesRef.current.get(targetPath) === currentTask) {
            saveFileQueuesRef.current.delete(targetPath);
          }
        })
        .catch(() => undefined);

      return currentTask;
    },
    [saveOpenedFile]
  );

  const enqueueConflictPath = useCallback(
    (targetPath: string) => {
      setConflictPaths((prev) => (prev.includes(targetPath) ? prev : [...prev, targetPath]));
    },
    [setConflictPaths]
  );

  // 保存指定或当前文件；通过 ref 读取 activeFilePath 保证回调稳定，防止切页签误触发防抖保存
  const saveFile = useCallback(
    async (filePath?: string) => {
      if (!canWrite) return;

      const targetPath = filePath ? filePath : activeFilePathRef.current;
      if (!targetPath) return;

      const epoch = workspaceEpochRef.current;
      try {
        await enqueueSaveFile(targetPath);
      } catch (err) {
        if (workspaceEpochRef.current !== epoch) return;
        if (isConflictSaveError(err)) {
          enqueueConflictPath(targetPath);
          return;
        }
        console.error('Failed to save file:', err);
        toast({
          title: t('chat:sandbox_save_failed'),
          description: getErrText(err),
          status: 'error'
        });
      }
    },
    [activeFilePathRef, canWrite, enqueueConflictPath, enqueueSaveFile, toast, t]
  );

  // 批量全部保存方法
  const saveAllFiles = useCallback(async () => {
    if (!canWrite) return;

    const epoch = workspaceEpochRef.current;
    const dirtyFiles =
      openedFilesRef.current?.filter(
        (f) => f.isDirty && !f.isLoading && !f.isBinary && !f.isUnknown && !f.readOnly
      ) ?? [];
    if (dirtyFiles.length === 0) return;

    const results = await Promise.allSettled(dirtyFiles.map((df) => enqueueSaveFile(df.path)));
    if (workspaceEpochRef.current !== epoch) return;

    let hasNonConflictFailure: PromiseRejectedResult | undefined;
    let firstConflictReason: unknown;
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      if (isConflictSaveError(result.reason)) {
        enqueueConflictPath(dirtyFiles[index].path);
        firstConflictReason ??= result.reason;
      } else {
        hasNonConflictFailure ??= result;
      }
    });

    if (hasNonConflictFailure) {
      console.error('Failed to save all files:', hasNonConflictFailure.reason);
      toast({
        title: t('chat:sandbox_save_failed'),
        description: getErrText(hasNonConflictFailure.reason),
        status: 'error'
      });
      throw hasNonConflictFailure.reason;
    }
    if (firstConflictReason !== undefined) {
      throw firstConflictReason;
    }
  }, [canWrite, enqueueConflictPath, enqueueSaveFile, openedFilesRef, toast, t]);

  const conflictFilePath = conflictPaths[0] ?? null;

  const onCloseConflictModal = useCallback(() => {
    setConflictPaths((prev) => prev.slice(1));
  }, [setConflictPaths]);

  /** 冲突弹窗操作 1：放弃本地未保存内容，重新加载远端最新文件与最新 ETag。 */
  const onReloadConflictFile = useCallback(async () => {
    if (!conflictFilePath) return;
    const epoch = workspaceEpochRef.current;
    const targetFile = openedFilesRef.current?.find((f) => f.path === conflictFilePath);
    if (!targetFile) {
      setConflictPaths((prev) => prev.filter((item) => item !== conflictFilePath));
      return;
    }

    setIsResolvingConflict(true);
    try {
      const reloaded = await loadFile({
        filePath: conflictFilePath,
        language: targetFile.language
      });
      if (workspaceEpochRef.current !== epoch) return;

      setOpenedFiles((prev) =>
        prev.map((item) =>
          item.path === conflictFilePath
            ? {
                ...item,
                content: reloaded.content,
                isUnknown: reloaded.isUnknown,
                etag: reloaded.etag,
                readOnly: reloaded.readOnly,
                isDirty: false,
                isSaving: false,
                hasSaveError: false
              }
            : item
        )
      );
      setConflictPaths((prev) => prev.filter((item) => item !== conflictFilePath));
    } catch (error) {
      if (workspaceEpochRef.current !== epoch) return;
      if (isNotFoundResponseError(error)) {
        closeOpenedFileByPath(conflictFilePath);
        return;
      }
      toast({
        title: t('chat:sandbox_load_failed'),
        description: getErrText(error),
        status: 'error'
      });
    } finally {
      if (workspaceEpochRef.current === epoch) {
        setIsResolvingConflict(false);
      }
    }
  }, [
    closeOpenedFileByPath,
    conflictFilePath,
    loadFile,
    openedFilesRef,
    setConflictPaths,
    setIsResolvingConflict,
    setOpenedFiles,
    t,
    toast
  ]);

  /** 冲突弹窗操作 2：忽略旧 `oldEtag`，强制以当前编辑器文本覆盖远端文件并刷新最新 ETag。 */
  const onOverwriteConflictFile = useCallback(async () => {
    if (!canWrite || !conflictFilePath) return;
    const epoch = workspaceEpochRef.current;
    setIsResolvingConflict(true);
    try {
      await enqueueSaveFile(conflictFilePath, { forceOverwrite: true });
      if (workspaceEpochRef.current !== epoch) return;
      setConflictPaths((prev) => prev.filter((item) => item !== conflictFilePath));
    } catch (error) {
      if (workspaceEpochRef.current !== epoch) return;
      toast({
        title: t('chat:sandbox_save_failed'),
        description: getErrText(error),
        status: 'error'
      });
    } finally {
      if (workspaceEpochRef.current === epoch) {
        setIsResolvingConflict(false);
      }
    }
  }, [
    canWrite,
    conflictFilePath,
    enqueueSaveFile,
    setConflictPaths,
    setIsResolvingConflict,
    t,
    toast
  ]);

  // 500ms 防抖自动保存脏文件；在途保存或上次保存失败的文件暂停自动重试，等待用户再次编辑或手动保存
  useEffect(() => {
    if (!canWrite || stateSessionKey !== sessionKey) return;

    const dirtyFiles = openedFiles.filter(
      (f) =>
        f.isDirty &&
        !f.isSaving &&
        !f.hasSaveError &&
        !f.isLoading &&
        !f.isBinary &&
        !f.isUnknown &&
        !f.readOnly
    );
    if (dirtyFiles.length === 0) return;

    const timer = setTimeout(() => {
      dirtyFiles.forEach((f) => {
        void saveFile(f.path);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [canWrite, openedFiles, saveFile, sessionKey, stateSessionKey]);

  // 下载当前文件
  const downloadCurrentFile = async () => {
    if (!activeFile) return;
    setDownloadingFile(true);
    try {
      await downloadSandbox({ ...sandboxTarget, chatId, outLinkAuthData, path: activeFile.path });
    } finally {
      setDownloadingFile(false);
    }
  };

  // 打开文件
  const openFile = async (filePath: string) => {
    if (!filePath) return;

    const epoch = workspaceEpochRef.current;
    const existingFile = openedFiles.find((f) => f.path === filePath);
    if (existingFile) {
      setActiveFilePath(filePath);
      setSelectedPath(filePath);
      return;
    }

    const fileName = filePath.split('/').pop() ?? '';
    const language = getLanguageByFileName(fileName);
    const isBinary = getIsBinaryByLanguage(language);
    const tempFile: OpenedFile = {
      path: filePath,
      name: fileName,
      content: '',
      language,
      isBinary,
      isLoading: true,
      isDirty: false
    };

    const isAlreadyLoading = loadingFilePathsRef.current.has(filePath);
    setOpenedFiles((prev) =>
      prev.some((file) => file.path === filePath) ? prev : [...prev, tempFile]
    );
    setActiveFilePath(filePath);
    setSelectedPath(filePath);

    if (isAlreadyLoading) return;

    try {
      loadingFilePathsRef.current.add(filePath);
      const node = fileTreeRef.current && findNodeByPath(fileTreeRef.current, filePath);
      const mediaVersion =
        typeof node?.mtime === 'number' || typeof node?.size === 'number'
          ? `${node?.mtime ?? ''}-${node?.size ?? ''}`
          : undefined;
      const { content, isUnknown, etag, readOnly } = await loadFile({
        filePath,
        language,
        mediaVersion
      });
      if (workspaceEpochRef.current !== epoch) {
        return;
      }

      setOpenedFiles((prev) =>
        prev.map((f) =>
          f.path === filePath
            ? {
                ...f,
                content,
                isUnknown,
                isLoading: false,
                readOnly,
                etag
              }
            : f
        )
      );
    } catch (error) {
      if (workspaceEpochRef.current !== epoch) return;
      console.error('Failed to open file:', error);
      setOpenedFiles((prev) => {
        const newOpenedFiles = prev.filter((f) => f.path !== filePath);
        setActiveFilePath((currActive) => {
          if (currActive === filePath) {
            return newOpenedFiles.length > 0 ? newOpenedFiles[newOpenedFiles.length - 1].path : '';
          }
          return currActive;
        });
        return newOpenedFiles;
      });
    } finally {
      if (workspaceEpochRef.current === epoch) {
        loadingFilePathsRef.current.delete(filePath);
      }
    }
  };

  // 关闭文件
  const closeFile = (filePath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    closeOpenedFileByPath(filePath, { clearSelectedPath: false });
  };

  // 乐观更新路径辅助函数：将 oldPath 及其子路径替换为 newPath
  const updateStatePaths = ({
    oldPath,
    newPath,
    newName
  }: {
    oldPath: string;
    newPath: string;
    newName?: string;
  }) => {
    setConflictPaths((prev) => prev.map((path) => replacePathPrefix(path, oldPath, newPath)));
    setOpenedFiles((prev) =>
      prev.map((f) => {
        if (f.path === oldPath) {
          return { ...f, path: newPath, ...(newName ? { name: newName } : {}) };
        }
        if (f.path.startsWith(oldPath + '/')) {
          return { ...f, path: replacePathPrefix(f.path, oldPath, newPath) };
        }
        return f;
      })
    );

    setActiveFilePath((prev) => {
      return replacePathPrefix(prev, oldPath, newPath);
    });

    setSelectedPath((prev) => {
      return replacePathPrefix(prev, oldPath, newPath);
    });

    setExpandedDirs((prev) => {
      const next = new Set<string>();
      prev.forEach((path) => {
        next.add(replacePathPrefix(path, oldPath, newPath));
      });
      return next;
    });
  };

  // 乐观删除路径辅助函数
  const deleteStatePaths = (filePath: string) => {
    setConflictPaths((prev) =>
      prev.filter((path) => path !== filePath && !path.startsWith(filePath + '/'))
    );
    setOpenedFiles((prev) =>
      prev.filter((f) => f.path !== filePath && !f.path.startsWith(filePath + '/'))
    );

    setActiveFilePath((prev) => {
      if (prev === filePath || prev.startsWith(filePath + '/')) return '';
      return prev;
    });

    setSelectedPath((prev) => {
      if (prev === filePath || prev.startsWith(filePath + '/')) return '';
      return prev;
    });
  };

  // 新建文件/目录 (乐观更新)
  const onCreateNode = useCallback(
    async ({ parentPath, name, type }: CreateSandboxNodeParams) => {
      const epoch = workspaceEpochRef.current;
      if (!isValidPathSegment(name)) {
        toast({
          title: t('chat:sandbox_create_failed'),
          description: t('chat:sandbox_invalid_file_name'),
          status: 'warning'
        });
        return;
      }

      const fullPath = parentPath === '.' ? name : `${parentPath}/${name}`;

      const conflictNode = findNodeByPath(fileTree, fullPath);
      if (conflictNode) {
        toast({
          title: t('chat:sandbox_create_failed'),
          description: t('chat:sandbox_file_already_exists'),
          status: 'warning'
        });
        return;
      }

      let targetLevel = 0;
      if (parentPath !== '.') {
        const parentNode = findNodeByPath(fileTree, parentPath);
        if (parentNode) {
          targetLevel = parentNode.level + 1;
        } else {
          targetLevel = parentPath.split('/').length;
        }
      }

      const newNode: TreeNode = {
        name,
        path: fullPath,
        type,
        level: targetLevel,
        children: type === 'directory' ? [] : undefined,
        loaded: type === 'directory' ? true : undefined
      };

      setFileTree((prevTree) => addTreeNode(prevTree, parentPath, newNode));

      if (type === 'file') {
        const fileName = name;
        const language = getLanguageByFileName(fileName);
        const isBinary = getIsBinaryByLanguage(language);
        const tempFile: OpenedFile = {
          path: fullPath,
          name: fileName,
          content: '',
          language,
          isBinary,
          isLoading: true,
          isDirty: false
        };
        setOpenedFiles((prev) => [...prev, tempFile]);
        setActiveFilePath(fullPath);
        setSelectedPath(fullPath);
      }

      try {
        if (type === 'file') {
          const res = await uploadSandboxFile({
            ...sandboxTarget,
            chatId,
            outLinkAuthData,
            path: fullPath,
            file: new Blob([])
          });
          if (workspaceEpochRef.current !== epoch) return;
          setOpenedFiles((prev) =>
            prev.map((f) => (f.path === fullPath ? { ...f, isLoading: false, etag: res.etag } : f))
          );
        } else {
          await mkdirSandboxDirectory({
            ...sandboxTarget,
            chatId,
            outLinkAuthData,
            path: fullPath
          });
        }
      } catch (error) {
        if (workspaceEpochRef.current !== epoch) return;
        console.error('Failed to create node:', error);
        toast({
          title: t('chat:sandbox_create_failed'),
          description: getErrText(error),
          status: 'error'
        });
        deleteStatePaths(fullPath);
        setFileTree((prevTree) => deleteTreeNode(prevTree, fullPath));
        await refreshWorkspace({ preserveExpandedDirs: true });
      }
    },
    [fileTree, toast, t, sandboxTarget, chatId, outLinkAuthData, refreshWorkspace]
  );

  // 重命名完成 (乐观更新)
  const onRenameComplete = useCallback(
    async (oldPath: string, newName: string) => {
      if (!isValidPathSegment(newName)) {
        toast({
          title: t('chat:sandbox_rename_failed'),
          description: t('chat:sandbox_invalid_file_name'),
          status: 'warning'
        });
        return;
      }

      const oldName = oldPath.split('/').pop() ?? '';
      const parentPath = getSandboxParentPath(oldPath);
      const newPath = joinSandboxPath(parentPath, newName);

      if (oldPath === newPath) return;

      const conflictNode = findNodeByPath(fileTree, newPath);
      if (conflictNode) {
        toast({
          title: t('chat:sandbox_rename_failed'),
          description: t('chat:sandbox_file_already_exists'),
          status: 'warning'
        });
        return;
      }

      const mediaSnapshots = openedFilesRef.current ?? [];
      updateStatePaths({ oldPath, newPath, newName });
      setFileTree((prevTree) => renameTreeNodeInTree(prevTree, oldPath, newPath, newName));

      try {
        await moveSandboxEntry({
          ...sandboxTarget,
          chatId,
          outLinkAuthData,
          from: oldPath,
          to: newPath
        });
        await reloadMovedMediaPreviews(mediaSnapshots, { from: oldPath, to: newPath });
      } catch (error) {
        console.error('Failed to rename node:', error);
        toast({
          title: t('chat:sandbox_rename_failed'),
          description: getErrText(error),
          status: 'error'
        });
        updateStatePaths({ oldPath: newPath, newPath: oldPath, newName: oldName });
        setFileTree((prevTree) => renameTreeNodeInTree(prevTree, newPath, oldPath, oldName));
        await refreshWorkspace({ preserveExpandedDirs: true });
      }
    },
    [
      fileTree,
      toast,
      t,
      sandboxTarget,
      chatId,
      outLinkAuthData,
      refreshWorkspace,
      openedFilesRef,
      reloadMovedMediaPreviews
    ]
  );

  // 移动文件/目录（拖拽移动） (乐观更新)
  const onMoveFiles = useCallback(
    async (operations: SandboxMoveOperation[], options?: { expandPath?: string | null }) => {
      if (operations.length === 0) return [];

      const mediaSnapshots = openedFilesRef.current ?? [];
      operations.forEach((item) => {
        updateStatePaths({ oldPath: item.sourcePath, newPath: item.newPath });
      });
      setExpandedDirs((prev) =>
        applySandboxMoveOperationsToExpandedDirs(prev, operations, options?.expandPath)
      );
      setFileTree((prevTree) =>
        operations.reduce(
          (tree, item) => moveTreeNodeInTree(tree, item.sourcePath, item.targetDirPath),
          prevTree
        )
      );

      const movedItems: SandboxMoveOperation[] = [];
      try {
        for (const item of operations) {
          await moveSandboxEntry({
            ...sandboxTarget,
            chatId,
            outLinkAuthData,
            from: item.sourcePath,
            to: item.newPath
          });
          movedItems.push(item);
          await reloadMovedMediaPreviews(mediaSnapshots, {
            from: item.sourcePath,
            to: item.newPath
          });
        }

        return movedItems;
      } catch (error) {
        console.error('Failed to move file:', error);
        toast({
          title: t('chat:sandbox_move_failed'),
          description: getErrText(error),
          status: 'error'
        });

        const movedPathSet = new Set(movedItems.map((item) => item.newPath));
        const rollbackOperations = operations
          .filter((item) => !movedPathSet.has(item.newPath))
          .map((item) => ({
            sourcePath: item.newPath,
            currentParentPath: item.targetDirPath,
            targetDirPath: item.currentParentPath,
            newPath: item.sourcePath
          }));
        operations
          .slice()
          .reverse()
          .forEach((item) => {
            if (!movedPathSet.has(item.newPath)) {
              updateStatePaths({ oldPath: item.newPath, newPath: item.sourcePath });
            }
          });
        setExpandedDirs((prev) =>
          applySandboxMoveOperationsToExpandedDirs(prev, [...rollbackOperations].reverse())
        );
        setFileTree((prevTree) =>
          operations
            .slice()
            .reverse()
            .reduce((tree, item) => {
              return movedPathSet.has(item.newPath)
                ? tree
                : moveTreeNodeInTree(tree, item.newPath, item.currentParentPath);
            }, prevTree)
        );
        await refreshWorkspace({ preserveExpandedDirs: true });
        throw Object.assign(error instanceof Error ? error : new Error(getErrText(error)), {
          movedItems
        });
      }
    },
    [
      sandboxTarget,
      chatId,
      outLinkAuthData,
      toast,
      t,
      refreshWorkspace,
      openedFilesRef,
      reloadMovedMediaPreviews
    ]
  );

  const onMoveFile = useCallback(
    async (srcPath: string, targetDirPath: string) => {
      const fileName = getSandboxPathName(srcPath);
      const destPath = joinSandboxPath(targetDirPath, fileName);
      if (srcPath === destPath) return;

      await onMoveFiles([
        {
          sourcePath: srcPath,
          currentParentPath: getSandboxParentPath(srcPath),
          targetDirPath,
          newPath: destPath
        }
      ]);
    },
    [onMoveFiles]
  );

  // 删除文件/目录
  const onDeleteFile = useCallback(
    async (filePath: string) => {
      try {
        await deleteSandboxEntry({
          ...sandboxTarget,
          chatId,
          outLinkAuthData,
          path: filePath
        });
        deleteStatePaths(filePath);
        setFileTree((prevTree) => deleteTreeNode(prevTree, filePath));
      } catch (error) {
        console.error('Failed to delete file:', error);
        toast({
          title: t('chat:sandbox_delete_failed'),
          description: getErrText(error),
          status: 'error'
        });
        throw error;
      }
    },
    [sandboxTarget, chatId, outLinkAuthData, toast, t]
  );

  const onExecCommand = useCallback(
    async (command: string, timeoutMs?: number) => {
      return execSandboxCommand({
        ...sandboxTarget,
        chatId,
        outLinkAuthData,
        command,
        timeoutMs
      });
    },
    [sandboxTarget, chatId, outLinkAuthData]
  );

  // 上传文件
  const onUploadFiles = useCallback(
    async (files: FileList, targetDirPath: string) => {
      const uploadTasks: { path: string; file: File }[] = [];
      const pendingPaths = new Set<string>();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!isValidPathSegment(file.name)) {
          toast({
            title: t('chat:sandbox_upload_failed'),
            description: t('chat:sandbox_invalid_file_name'),
            status: 'warning'
          });
          return;
        }
        if (file.size > maxFileBytes) {
          toast({
            title: t('chat:sandbox_upload_too_large'),
            description: t('chat:sandbox_upload_too_large_desc', {
              name: file.name,
              size: maxFileSizeMB
            }),
            status: 'warning'
          });
          return;
        }
        const path = targetDirPath === '.' ? file.name : `${targetDirPath}/${file.name}`;
        if (pendingPaths.has(path) || findNodeByPath(fileTree, path)) {
          toast({
            title: t('chat:sandbox_upload_failed'),
            description: t('chat:sandbox_file_already_exists'),
            status: 'warning'
          });
          return;
        }
        pendingPaths.add(path);
        uploadTasks.push({ path, file });
      }

      let hasUploaded = false;
      try {
        for (const task of uploadTasks) {
          await uploadSandboxFile({
            ...sandboxTarget,
            chatId,
            outLinkAuthData,
            path: task.path,
            file: task.file
          });
          hasUploaded = true;
        }
      } catch (error) {
        console.error('Failed to upload files:', error);
        toast({
          title: t('chat:sandbox_upload_failed'),
          description: getErrText(error),
          status: 'error'
        });
      } finally {
        if (hasUploaded) {
          await refreshWorkspace({ preserveExpandedDirs: true });
        }
      }
    },
    [
      chatId,
      fileTree,
      maxFileBytes,
      maxFileSizeMB,
      outLinkAuthData,
      refreshWorkspace,
      sandboxTarget,
      toast,
      t
    ]
  );

  // 展开折叠目录
  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory') return;

    const epoch = workspaceEpochRef.current;
    const isExpanded = expandedDirs.has(node.path);

    if (isExpanded) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
    } else {
      if (!node.loaded) {
        await loadDirectory(node.path, node.level + 1)
          .then(() => {
            if (workspaceEpochRef.current !== epoch) return;
            setExpandedDirs((prev) => {
              const next = new Set(prev);
              next.add(node.path);
              return next;
            });
          })
          .catch((error) => {
            if (workspaceEpochRef.current !== epoch) return;
            console.error('Failed to load directory:', error);
          });
      } else {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);
          return next;
        });
      }
    }
  };

  return {
    fileTree,
    setFileTree,
    sessionWorkDirectory,
    isWorkspaceLoaded: !isPreparing && isWorkspaceLoaded,
    openedFiles,
    setOpenedFiles,
    openedFilesRef,
    activeFilePath,
    setActiveFilePath,
    selectedPath,
    setSelectedPath,
    expandedDirs,
    setExpandedDirs,
    loadingDirs,
    loadingRoot,
    downloadingFile,
    searchQuery,
    setSearchQuery,
    activeFile,
    refreshWorkspace,
    onWorkspaceFocus,
    openFile,
    closeFile,
    saveFile,
    saveAllFiles,
    conflictFilePath,
    isResolvingConflict,
    onCloseConflictModal,
    onReloadConflictFile,
    onOverwriteConflictFile,
    downloadCurrentFile,
    onCreateNode,
    onRenameComplete,
    onMoveFile,
    onMoveFiles,
    onDeleteFile,
    onUploadFiles,
    onExecCommand,
    toggleDirectory
  };
};
