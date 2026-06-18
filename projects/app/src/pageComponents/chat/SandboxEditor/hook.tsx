import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import SandboxEditorModal from '@/pageComponents/chat/SandboxEditor/modal';
import type { IconButtonProps } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { checkSandboxExist, downloadSandbox, getSandboxProxyWsUrl, getSandboxTicket } from './api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useContextSelector } from 'use-context-selector';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useLatest } from 'ahooks';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { TreeNode } from './components/FileTree';
import type { OpenedFile } from './components/FileTabs';
import {
  getLanguageByFileName,
  getIsBinaryByLanguage,
  addTreeNode,
  deleteTreeNode,
  moveTreeNodeInTree,
  renameTreeNodeInTree,
  findNodeByPath,
  sortTreeNodes,
  updateTreeNode
} from './utils';

const SYSTEM_FILE_NAMES = ['.DS_Store'];
const INITIAL_TREE_MAX_DEPTH = 20;
const RPC_TIMEOUT_MS = 30000;
const DEFAULT_MAX_FILE_SIZE_MB = 10;
const INVALID_PATH_SEGMENT_CHARS = /[\/\\\u0000]/;

type RefreshWorkspaceOptions = {
  preserveExpandedDirs?: boolean;
};

type SandboxDirEntry = {
  name: string;
  is_dir: boolean;
  size?: number;
  mtime?: number;
};

type SandboxReadFileResponse = {
  content: string;
  mtime?: number;
};

type SandboxWriteFileResponse = {
  mtime?: number;
};

type SandboxReadDirRecursiveResponse = {
  files?: TreeNode[];
  expandedPaths?: string[];
};

const encodeBase64 = (content: string) => {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};

const isValidPathSegment = (name: string) =>
  !!name && name !== '.' && name !== '..' && !INVALID_PATH_SEGMENT_CHARS.test(name);

const replacePathPrefix = (path: string, oldPath: string, newPath: string) => {
  if (path === oldPath) return newPath;
  if (path.startsWith(oldPath + '/')) return `${newPath}${path.slice(oldPath.length)}`;
  return path;
};

/**
 * useSandboxEditor —— UI Hook
 *
 * 职责：仅负责渲染 SandboxEditorModal 弹窗及其开关逻辑。
 */
export const useSandboxEditor = ({
  appId,
  chatId,
  outLinkAuthData,
  afterClose,
  showFileOps = false,
  showDownload = true
}: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  afterClose?: () => void;
  showFileOps?: boolean;
  showDownload?: boolean;
}) => {
  const [sandboxModalOpen, setSandboxModalOpen] = useState(false);

  const onOpenSandboxModal = useCallback(() => {
    setSandboxModalOpen(true);
  }, []);

  const onCloseSandboxModal = useCallback(() => {
    setSandboxModalOpen(false);
    afterClose?.();
  }, [afterClose]);

  const SandboxEditorModalDom = useCallback(() => {
    return sandboxModalOpen ? (
      <SandboxEditorModal
        onClose={onCloseSandboxModal}
        appId={appId}
        chatId={chatId}
        outLinkAuthData={outLinkAuthData}
        showFileOps={showFileOps}
        showDownload={showDownload}
      />
    ) : null;
  }, [
    sandboxModalOpen,
    onCloseSandboxModal,
    appId,
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
 * 同步模式：
 *   1. 历史记录（ChatRecordContext）：useMemo 派生，无副作用。
 *   2. 网络请求：单一 useEffect，在参数变化时触发 1 次。
 *   3. API 与本地历史取并集，避免首次 API=false 压住本轮对话新出现的 sandbox。
 */
export const useSandboxStatus = ({
  appId,
  chatId,
  outLinkAuthData
}: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  const { t } = useTranslation();
  const [apiSandboxStatus, setApiSandboxStatus] = useState({
    appId: '',
    chatId: '',
    exists: false
  });

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
    if (!appId || !chatId) return;
    let cancelled = false;
    checkSandboxExist({ appId, chatId, outLinkAuthData })
      .then((result) => {
        if (!cancelled) setApiSandboxStatus({ appId, chatId, exists: result.exists });
      })
      .catch((error) => {
        console.error('Failed to check sandbox status:', error);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appId,
    chatId,
    outLinkAuthData?.shareId,
    outLinkAuthData?.outLinkUid,
    outLinkAuthData?.teamId,
    outLinkAuthData?.teamToken
  ]);

  const apiSandboxExists =
    apiSandboxStatus.appId === appId &&
    apiSandboxStatus.chatId === chatId &&
    apiSandboxStatus.exists;
  const sandboxExists = apiSandboxExists || hasSandboxInHistory;

  const setSandboxExists = useCallback(
    (exists: boolean) => {
      setApiSandboxStatus({ appId, chatId, exists });
    },
    [appId, chatId]
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
            onClick={onOpen}
            {...props}
            aria-label={t('chat:sandbox_entry_tooltip')}
          />
        </MyTooltip>
      );
    },
    [sandboxExists, t]
  );

  return {
    sandboxExists,
    setSandboxExists,
    SandboxEntryIcon
  };
};

const getMimeTypeByFileName = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'm4a':
      return 'audio/mp4';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
      return 'audio/ogg';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
};

/**
 * useSandboxFileStore —— File Management Hook
 *
 * 职责：整合 Sandbox 的文件树与 Tab 状态，收拢乐观更新、异步请求及细粒度失败回滚。
 */
export const useSandboxFileStore = ({
  appId,
  chatId,
  outLinkAuthData,
  isPreparing = false,
  canWrite = true,
  onError
}: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  isPreparing?: boolean;
  canWrite?: boolean;
  onError?: (err: Error) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const maxFileBytes =
    useSystemStore((state) => state.feConfigs.limit?.agentSandboxMaxFileBytes) ??
    DEFAULT_MAX_FILE_SIZE_MB * 1024 * 1024;
  const maxFileSizeMB = Math.ceil(maxFileBytes / 1024 / 1024);

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [loadingRoot, setLoadingRoot] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const reconnectAttemptsRef = useRef(0);

  // 多标签页状态与选中节点路径状态
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const openedFilesRef = useLatest(openedFiles);
  const expandedDirsRef = useLatest(expandedDirs);
  const onErrorRef = useLatest(onError);
  const loadingFilePathsRef = useRef<Set<string>>(new Set());
  const isRefreshingWorkspaceRef = useRef(false);
  const hasPendingWorkspaceRefreshRef = useRef(false);

  // ==================== WebSocket 长连接及 JSON-RPC 2.0 ====================
  const wsRef = useRef<WebSocket | null>(null);
  const nextRpcIdRef = useRef(1);
  const pendingRpcRequestsRef = useRef<
    Map<number, { resolve: (res: unknown) => void; reject: (err: unknown) => void }>
  >(new Map());
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const resolveConnectRef = useRef<(() => void) | null>(null);
  const rejectConnectRef = useRef<((error: Error) => void) | null>(null);
  const stoppedConnectErrorRef = useRef<Error | null>(null);

  const resetConnectPromise = useCallback(() => {
    const promise = new Promise<void>((resolve, reject) => {
      resolveConnectRef.current = resolve;
      rejectConnectRef.current = reject;
    });
    void promise.catch(() => undefined);
    connectPromiseRef.current = promise;
  }, []);

  const closeOpenedFileByPath = useCallback((filePath: string) => {
    setOpenedFiles((prev) => {
      const next = prev.filter((file) => {
        const shouldClose = file.path === filePath;
        if (shouldClose && file.isBinary && file.content.startsWith('blob:')) {
          URL.revokeObjectURL(file.content);
        }
        return !shouldClose;
      });

      setActiveFilePath((current) => {
        if (current !== filePath) return current;
        return next.length > 0 ? next[next.length - 1].path : '';
      });

      setSelectedPath((current) => (current === filePath ? '' : current));

      return next;
    });
  }, []);

  // RPC 调用
  const rpcCall = useCallback(
    async <T = unknown,>(method: string, params: unknown): Promise<T> => {
      if (stoppedConnectErrorRef.current) {
        throw stoppedConnectErrorRef.current;
      }
      if (!connectPromiseRef.current) {
        resetConnectPromise();
      }
      await connectPromiseRef.current;

      const currentWs = wsRef.current;
      if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket is not connected');
      }
      const id = nextRpcIdRef.current++;
      const promise = new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pendingRpcRequestsRef.current.delete(id);
          reject(new Error(`Sandbox RPC timeout: ${method}`));
        }, RPC_TIMEOUT_MS);

        pendingRpcRequestsRef.current.set(id, {
          resolve: (res) => {
            window.clearTimeout(timer);
            resolve(res as T);
          },
          reject: (err) => {
            window.clearTimeout(timer);
            reject(err);
          }
        });
      });
      try {
        currentWs.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params
          })
        );
      } catch (error) {
        pendingRpcRequestsRef.current.get(id)?.reject(error);
        pendingRpcRequestsRef.current.delete(id);
        throw error;
      }
      return promise;
    },
    [resetConnectPromise]
  );

  // 读取文件内容 - 根据 language 决定解码策略
  const loadFile = useCallback(
    async (
      filePath: string,
      language: string
    ): Promise<{ content: string; isUnknown: boolean; mtime?: number }> => {
      const isBinary = getIsBinaryByLanguage(language);
      const res = await rpcCall<SandboxReadFileResponse>('fs/read_file', { path: filePath });
      const rawBytes = Uint8Array.from(window.atob(res.content), (c) => c.charCodeAt(0));

      if (!isBinary) {
        try {
          const content = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
          return { content, isUnknown: false, mtime: res.mtime };
        } catch {
          return { content: '', isUnknown: true, mtime: res.mtime };
        }
      } else {
        const mimeType = getMimeTypeByFileName(filePath.split('/').pop() || '');
        const blob = new Blob([rawBytes], { type: mimeType });
        return { content: URL.createObjectURL(blob), isUnknown: false, mtime: res.mtime };
      }
    },
    [rpcCall]
  );

  const refreshWorkspace = useCallback(
    async (options: RefreshWorkspaceOptions = {}) => {
      if (isRefreshingWorkspaceRef.current) {
        hasPendingWorkspaceRefreshRef.current = true;
        return;
      }

      isRefreshingWorkspaceRef.current = true;
      try {
        let refreshOptions = options;
        do {
          hasPendingWorkspaceRefreshRef.current = false;
          const shouldShowLoadingRoot = fileTree.length === 0;
          if (shouldShowLoadingRoot) {
            setLoadingRoot(true);
          }
          let latestFileTree: TreeNode[] | null = null;

          try {
            const data = await rpcCall<SandboxReadDirRecursiveResponse>('fs/read_dir_recursive', {
              path: '.',
              maxDepth: INITIAL_TREE_MAX_DEPTH,
              excludeNames: SYSTEM_FILE_NAMES
            });

            const nextFileTree = data.files || [];
            latestFileTree = nextFileTree;
            setFileTree(nextFileTree);
            setExpandedDirs(
              refreshOptions.preserveExpandedDirs
                ? new Set(expandedDirsRef.current)
                : new Set(data.expandedPaths || [])
            );
          } catch (error) {
            console.error('Failed to refresh workspace via WS:', error);
          } finally {
            if (shouldShowLoadingRoot) {
              setLoadingRoot(false);
            }
          }

          if (!hasPendingWorkspaceRefreshRef.current) {
            const filesToReload =
              openedFilesRef.current
                ?.filter((f) => !f.isDirty && !f.isBinary && !f.isUnknown)
                .map((f) => ({
                  path: f.path,
                  language: f.language,
                  content: f.content,
                  mtime: f.mtime
                })) || [];

            if (filesToReload.length > 0) {
              const reloadResults = await Promise.allSettled(
                filesToReload.map(async (f) => {
                  const { content, isUnknown, mtime } = await loadFile(f.path, f.language);
                  return { content, isUnknown, mtime };
                })
              );

              const updates = new Map<
                string,
                { content: string; isUnknown: boolean; mtime?: number }
              >();
              const snapshots = new Map(
                filesToReload.map((f) => [f.path, { content: f.content, mtime: f.mtime }])
              );
              reloadResults.forEach((result, idx) => {
                const f = filesToReload[idx];
                if (result.status === 'fulfilled') {
                  updates.set(f.path, result.value);
                } else if (latestFileTree && !findNodeByPath(latestFileTree, f.path)) {
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
                      item.content === snapshot.content &&
                      item.mtime === snapshot.mtime
                    ) {
                      return {
                        ...item,
                        content: update.content,
                        isUnknown: update.isUnknown,
                        mtime: update.mtime,
                        isDirty: false
                      };
                    }
                    return item;
                  })
                );
              }
            }
          }

          // 并发文件事件只需要再补一次刷新，避免事件风暴触发多次全量扫描。
          refreshOptions = { preserveExpandedDirs: true };
        } while (hasPendingWorkspaceRefreshRef.current);
      } finally {
        isRefreshingWorkspaceRef.current = false;
      }
    },
    [
      expandedDirsRef,
      fileTree.length,
      rpcCall,
      setExpandedDirs,
      setFileTree,
      setLoadingRoot,
      openedFilesRef,
      closeOpenedFileByPath,
      loadFile
    ]
  );

  const refreshWorkspaceRef = useLatest(refreshWorkspace);

  // 维持长连接连接
  useEffect(() => {
    if (!appId || !chatId) return;

    reconnectAttemptsRef.current = 0;
    stoppedConnectErrorRef.current = null;

    if (isPreparing) {
      Promise.resolve().then(() => {
        setIsWsConnected(false);
        stoppedConnectErrorRef.current = null;
      });
      rejectConnectRef.current?.(new Error('Sandbox is preparing'));
      resetConnectPromise();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let isDestroyed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingRpcRequests = pendingRpcRequestsRef.current;

    const connect = async () => {
      if (reconnectAttemptsRef.current >= 5) {
        const errMsg = t(
          'chat:sandbox_connect_failed_max_attempts',
          '连接沙盒失败次数过多，已停止尝试。'
        );
        if (!onErrorRef.current) {
          toast({
            title: errMsg,
            description: t('chat:sandbox_refresh_page_to_retry', '请刷新页面重试。'),
            status: 'error',
            duration: 5000,
            isClosable: true
          });
        }
        setIsWsConnected(false);
        const error = new Error(errMsg);
        stoppedConnectErrorRef.current = error;
        rejectConnectRef.current?.(error);
        onErrorRef.current?.(error);
        return;
      }

      reconnectAttemptsRef.current++;

      if (!connectPromiseRef.current) {
        resetConnectPromise();
      }
      try {
        const res = await getSandboxTicket({
          appId,
          chatId,
          outLinkAuthData,
          channel: 'fs',
          permission: canWrite ? 'write' : 'read'
        });
        const ticket = res.ticket;

        if (!ticket) {
          throw new Error('Ticket not found in response: ' + JSON.stringify(res));
        }
        if (isDestroyed) return;

        const wsUrl = getSandboxProxyWsUrl({ channel: 'fs', ticket });

        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDestroyed) {
            ws?.close();
            return;
          }
          stoppedConnectErrorRef.current = null;
          setIsWsConnected(true);
          resolveConnectRef.current?.();
          refreshWorkspaceRef.current?.();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            reconnectAttemptsRef.current = 0;
            if (data.jsonrpc === '2.0' && data.id !== undefined) {
              const rpcId = Number(data.id);
              const pending = pendingRpcRequests.get(rpcId);
              if (pending) {
                pendingRpcRequests.delete(rpcId);
                if (data.error) {
                  pending.reject(new Error(data.error.message || 'Sandbox RPC failed'));
                } else {
                  pending.resolve(data.result);
                }
              }
            } else if (data.jsonrpc === '2.0' && data.method === 'fs/did_change') {
              void refreshWorkspaceRef.current?.({ preserveExpandedDirs: true });
            }
          } catch (e) {
            console.error('[SandboxWS] Failed to parse WebSocket message:', e);
          }
        };

        ws.onclose = (e) => {
          if (wsRef.current !== ws) return;

          const closeMessage =
            e.reason ||
            `${t('chat:sandbox_connection_closed', '沙盒连接已断开')} (code: ${e.code})`;

          wsRef.current = null;
          setIsWsConnected(false);
          stoppedConnectErrorRef.current = null;
          rejectConnectRef.current?.(new Error(closeMessage));
          resetConnectPromise();

          // 拒绝并清空当前所有积压的 pending RPC 请求，防止网络瞬断或代理重启时前端 Promise 永久 Pending 卡死
          pendingRpcRequests.forEach((req) => {
            req.reject(new Error(closeMessage));
          });
          pendingRpcRequests.clear();

          if (!isDestroyed) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };

        ws.onerror = (err) => {
          console.error('[SandboxWS] WebSocket error:', err);
          ws?.close();
        };
      } catch (error) {
        console.error('[SandboxWS] Handshake failed, retrying in 5s:', error);
        setIsWsConnected(false);
        stoppedConnectErrorRef.current = null;
        rejectConnectRef.current?.(error instanceof Error ? error : new Error(getErrText(error)));
        resetConnectPromise();
        if (!isDestroyed) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      isDestroyed = true;
      if (ws) {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        ws.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      pendingRpcRequests.forEach((req) => {
        req.reject(new Error('WebSocket connection closed'));
      });
      pendingRpcRequests.clear();
      rejectConnectRef.current?.(new Error('WebSocket connection closed'));
      resetConnectPromise();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appId,
    chatId,
    outLinkAuthData?.shareId,
    outLinkAuthData?.outLinkUid,
    outLinkAuthData?.teamId,
    outLinkAuthData?.teamToken,
    isPreparing,
    canWrite,
    refreshWorkspaceRef,
    resetConnectPromise,
    t,
    toast
  ]);
  // =========================================================================

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

  // 组件卸载时清理 Blob URL 内存
  useEffect(() => {
    const filesRef = openedFilesRef;
    return () => {
      filesRef.current?.forEach((file) => {
        if (file.isBinary && file.content.startsWith('blob:')) {
          URL.revokeObjectURL(file.content);
        }
      });
    };
  }, [openedFilesRef]);

  // 加载目录 - 改造为普通异步函数，避免 useRequest 的并发竞态问题
  const loadDirectory = useCallback(
    async (path: string, level: number) => {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });

      try {
        const res = await rpcCall<SandboxDirEntry[]>('fs/read_dir', { path });
        let filteredFiles = (res || []).map((item) => ({
          name: item.name,
          path: path === '.' ? item.name : `${path}/${item.name}`,
          type: item.is_dir ? ('directory' as const) : ('file' as const),
          size: item.size,
          mtime: item.mtime
        }));

        filteredFiles = filteredFiles.filter((file) => !SYSTEM_FILE_NAMES.includes(file.name));

        const nodes: TreeNode[] = filteredFiles.map((file) => ({
          ...file,
          level,
          children: file.type === 'directory' ? [] : undefined,
          loaded: false // 子目录初始未加载
        }));

        const sortedNodes = sortTreeNodes(nodes);

        setFileTree((prevTree) => {
          if (level === 0) {
            return sortedNodes;
          }
          // 更新目标节点，标记为已加载
          return updateTreeNode(prevTree, path, sortedNodes, true);
        });

        return sortedNodes;
      } catch (error) {
        toast({
          title: t('chat:sandbox_load_failed', '加载目录失败'),
          description: getErrText(error),
          status: 'error'
        });
        throw error;
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [toast, t, setLoadingDirs, setFileTree, rpcCall]
  );

  // refreshWorkspace 已提升至上层长连接前以供事件驱动调用

  // 保存指定或当前文件
  const saveFile = useCallback(
    async (filePath?: string) => {
      if (!canWrite) return;

      const targetPath = filePath || activeFilePath;
      if (!targetPath) return;

      const targetFile = openedFilesRef.current?.find((f) => f.path === targetPath);
      if (!targetFile || targetFile.isBinary || targetFile.isUnknown) return;

      try {
        const savedContent = targetFile.content;
        const savedMtime = targetFile.mtime;
        const b64 = encodeBase64(savedContent);
        const res = await rpcCall<SandboxWriteFileResponse>('fs/write_file', {
          path: targetPath,
          content: b64,
          old_mtime: savedMtime
        });
        const newMtime = res.mtime;

        // 保存成功后只清理同一份内容，避免保存期间继续编辑被误标为已保存。
        setOpenedFiles((prev) =>
          prev.map((f) =>
            f.path === targetPath && f.content === savedContent && f.mtime === savedMtime
              ? { ...f, isDirty: false, mtime: newMtime }
              : f
          )
        );
      } catch (err) {
        console.error('Failed to save file:', err);
        toast({
          title: t('chat:sandbox_save_failed', '保存文件失败'),
          description: getErrText(err),
          status: 'error'
        });
      }
    },
    [activeFilePath, canWrite, openedFilesRef, rpcCall, toast, t]
  );

  // 批量全部保存方法
  const saveAllFiles = useCallback(async () => {
    if (!canWrite) return;

    const dirtyFiles =
      openedFilesRef.current?.filter((f) => f.isDirty && !f.isBinary && !f.isUnknown) || [];
    if (dirtyFiles.length === 0) return;

    const results = await Promise.allSettled(
      dirtyFiles.map(async (df) => {
        const currentFile = openedFilesRef.current?.find((f) => f.path === df.path);
        if (!currentFile || currentFile.isBinary || currentFile.isUnknown) return;

        const savedContent = currentFile.content;
        const savedMtime = currentFile.mtime;
        const b64 = encodeBase64(savedContent);
        const res = await rpcCall<SandboxWriteFileResponse>('fs/write_file', {
          path: df.path,
          content: b64,
          old_mtime: savedMtime
        });
        const newMtime = res.mtime;

        setOpenedFiles((prev) =>
          prev.map((f) =>
            f.path === df.path && f.content === savedContent && f.mtime === savedMtime
              ? { ...f, isDirty: false, mtime: newMtime }
              : f
          )
        );
      })
    );

    const failedResult = results.find((result) => result.status === 'rejected');
    if (failedResult?.status === 'rejected') {
      console.error('Failed to save all files:', failedResult.reason);
      toast({
        title: t('chat:sandbox_save_failed', '保存文件失败'),
        description: getErrText(failedResult.reason),
        status: 'error'
      });
      throw failedResult.reason;
    }
  }, [canWrite, openedFilesRef, rpcCall, toast, t]);

  // 500ms 防抖自动保存脏文件
  useEffect(() => {
    const dirtyFiles = openedFiles.filter((f) => f.isDirty && !f.isBinary && !f.isUnknown);
    if (dirtyFiles.length === 0) return;

    const timer = setTimeout(() => {
      dirtyFiles.forEach((f) => {
        saveFile(f.path);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [openedFiles, saveFile]);

  // 下载当前文件
  const downloadCurrentFile = async () => {
    if (!activeFile) return;
    setDownloadingFile(true);
    try {
      await downloadSandbox({ appId, chatId, outLinkAuthData, path: activeFile.path });
    } finally {
      setDownloadingFile(false);
    }
  };

  // 打开文件
  const openFile = async (filePath: string) => {
    if (!filePath) return;
    // 检查是否已打开或正在加载
    const existingFile = openedFiles.find((f) => f.path === filePath);
    const isAlreadyLoading = loadingFilePathsRef.current.has(filePath);

    if (existingFile || isAlreadyLoading) {
      setActiveFilePath(filePath);
      setSelectedPath(filePath);
      return;
    }

    const fileName = filePath.split('/').pop() || '';
    const language = getLanguageByFileName(fileName);
    const isBinary = getIsBinaryByLanguage(language);

    // 先乐观推送临时 Tab
    const tempFile: OpenedFile = {
      path: filePath,
      name: fileName,
      content: '',
      language,
      isBinary,
      isDirty: false
    };

    setOpenedFiles((prev) => [...prev, tempFile]);
    setActiveFilePath(filePath);
    setSelectedPath(filePath);

    try {
      loadingFilePathsRef.current.add(filePath);
      const { content, isUnknown, mtime } = await loadFile(filePath, language);

      // 加载成功后更新 Tab 状态
      setOpenedFiles((prev) =>
        prev.map((f) =>
          f.path === filePath
            ? {
                ...f,
                content,
                isUnknown,
                mtime
              }
            : f
        )
      );
    } catch (error) {
      console.error('Failed to open file:', error);
      // 如果加载失败，把这个临时的 tab 移出，并切到其他 tab 或清空
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
      loadingFilePathsRef.current.delete(filePath);
    }
  };

  // 关闭文件
  const closeFile = (filePath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // 如果关闭的是当前文件,切换到其他文件
    setOpenedFiles((prev) => {
      const target = prev.find((f) => f.path === filePath);
      if (target?.isBinary && target.content.startsWith('blob:')) {
        URL.revokeObjectURL(target.content);
      }

      const newOpenedFiles = prev.filter((f) => f.path !== filePath);

      if (activeFilePath === filePath) {
        if (newOpenedFiles.length > 0) {
          setActiveFilePath(newOpenedFiles[newOpenedFiles.length - 1].path);
        } else {
          setActiveFilePath('');
        }
      }

      return newOpenedFiles;
    });
  };

  // 乐观更新路径辅助函数：将 oldPath 及其子路径替换为 newPath
  const updateStatePaths = (oldPath: string, newPath: string, newName?: string) => {
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
    async (parentPath: string, name: string, type: 'file' | 'directory') => {
      if (!isValidPathSegment(name)) {
        toast({
          title: t('chat:sandbox_create_failed'),
          description: t('chat:sandbox_invalid_file_name', '文件名不能包含路径分隔符或使用 . / ..'),
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

      // 1. 乐观更新文件树 UI
      setFileTree((prevTree) => addTreeNode(prevTree, parentPath, newNode));

      // 2. 如果是文件，乐观更新标签页并打开
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
          isDirty: false
        };
        setOpenedFiles((prev) => [...prev, tempFile]);
        setActiveFilePath(fullPath);
        setSelectedPath(fullPath);
      }

      // 3. 异步发送请求，若失败则回滚状态
      try {
        if (type === 'file') {
          await rpcCall('fs/write_file', { path: fullPath, content: encodeBase64('') });
        } else {
          await rpcCall('fs/mkdir', { path: fullPath });
        }
      } catch (error) {
        console.error('Failed to create node:', error);
        toast({
          title: t('chat:sandbox_create_failed', '创建失败'),
          description: getErrText(error),
          status: 'error'
        });
        deleteStatePaths(fullPath);
        setFileTree((prevTree) => deleteTreeNode(prevTree, fullPath));
        await refreshWorkspace({ preserveExpandedDirs: true });
      }
    },
    [fileTree, toast, t, rpcCall, refreshWorkspace]
  );

  // 重命名完成 (乐观更新)
  const onRenameComplete = useCallback(
    async (oldPath: string, newName: string) => {
      if (!isValidPathSegment(newName)) {
        toast({
          title: t('chat:sandbox_rename_failed'),
          description: t('chat:sandbox_invalid_file_name', '文件名不能包含路径分隔符或使用 . / ..'),
          status: 'warning'
        });
        return;
      }

      const oldName = oldPath.split('/').pop() || '';
      const parts = oldPath.split('/');
      parts.pop();
      const parentPath = parts.join('/');
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;

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

      // 1. 乐观更新
      updateStatePaths(oldPath, newPath, newName);
      setFileTree((prevTree) => renameTreeNodeInTree(prevTree, oldPath, newPath, newName));

      // 2. 异步请求，失败时回滚
      try {
        await rpcCall('fs/move', {
          from: oldPath,
          to: newPath
        });
      } catch (error) {
        console.error('Failed to rename node:', error);
        toast({
          title: t('chat:sandbox_rename_failed', '重命名失败'),
          description: getErrText(error),
          status: 'error'
        });
        updateStatePaths(newPath, oldPath, oldName);
        setFileTree((prevTree) => renameTreeNodeInTree(prevTree, newPath, oldPath, oldName));
        await refreshWorkspace({ preserveExpandedDirs: true });
      }
    },
    [fileTree, toast, t, rpcCall, refreshWorkspace]
  );

  // 移动文件/目录（拖拽移动） (乐观更新)
  const onMoveFile = useCallback(
    async (srcPath: string, targetDirPath: string) => {
      const parts = srcPath.split('/');
      const fileName = parts.pop() || '';
      const srcParentPath = parts.join('/') || '.';
      const destPath = targetDirPath === '.' ? fileName : `${targetDirPath}/${fileName}`;

      if (srcPath === destPath) return;

      // 1. 乐观更新
      updateStatePaths(srcPath, destPath);
      setFileTree((prevTree) => moveTreeNodeInTree(prevTree, srcPath, targetDirPath));

      // 2. 异步请求，失败时回滚
      try {
        await rpcCall('fs/move', {
          from: srcPath,
          to: destPath
        });
      } catch (error) {
        console.error('Failed to move file:', error);
        toast({
          title: t('chat:sandbox_move_failed', '移动失败'),
          description: getErrText(error),
          status: 'error'
        });
        updateStatePaths(destPath, srcPath);
        setFileTree((prevTree) => moveTreeNodeInTree(prevTree, destPath, srcParentPath));
        await refreshWorkspace({ preserveExpandedDirs: true });
      }
    },
    [rpcCall, toast, t, refreshWorkspace]
  );

  // 删除文件/目录
  const onDeleteFile = useCallback(
    async (filePath: string) => {
      try {
        await rpcCall('fs/delete', { path: filePath });
        deleteStatePaths(filePath);
        setFileTree((prevTree) => deleteTreeNode(prevTree, filePath));
      } catch (error) {
        console.error('Failed to delete file:', error);
        toast({
          title: t('chat:sandbox_delete_failed', '删除失败'),
          description: getErrText(error),
          status: 'error'
        });
      }
    },
    [rpcCall, toast, t]
  );

  // 上传文件
  const onUploadFiles = useCallback(
    async (files: FileList, targetDirPath: string) => {
      let targetLevel = 0;
      if (targetDirPath !== '.') {
        const parentNode = findNodeByPath(fileTree, targetDirPath);
        if (parentNode) {
          targetLevel = parentNode.level + 1;
        } else {
          targetLevel = targetDirPath.split('/').length;
        }
      }

      const uploadTasks: { path: string; content: string; newNode: TreeNode }[] = [];
      const pendingPaths = new Set<string>();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!isValidPathSegment(file.name)) {
          toast({
            title: t('chat:sandbox_upload_failed', '上传失败'),
            description: t(
              'chat:sandbox_invalid_file_name',
              '文件名不能包含路径分隔符或使用 . / ..'
            ),
            status: 'warning'
          });
          return;
        }
        if (file.size > maxFileBytes) {
          toast({
            title: t('chat:sandbox_upload_too_large', '文件过大'),
            description: t('chat:sandbox_upload_too_large_desc', {
              name: file.name,
              size: maxFileSizeMB,
              defaultValue: '单个文件不能超过 {{size}}MB，超大文件推荐通过沙盒内命令拉取。'
            }),
            status: 'warning'
          });
          return;
        }
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const resultStr = reader.result as string;
            const base64 = resultStr ? resultStr.split(',')[1] : '';
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const path = targetDirPath === '.' ? file.name : `${targetDirPath}/${file.name}`;
        if (pendingPaths.has(path) || findNodeByPath(fileTree, path)) {
          toast({
            title: t('chat:sandbox_upload_failed', '上传失败'),
            description: t('chat:sandbox_file_already_exists'),
            status: 'warning'
          });
          return;
        }
        pendingPaths.add(path);
        const newNode: TreeNode = {
          name: file.name,
          path,
          type: 'file',
          level: targetLevel
        };
        uploadTasks.push({ path, content, newNode });
      }

      // 乐观更新 UI
      const addedPaths: string[] = [];
      uploadTasks.forEach((task) => {
        setFileTree((prevTree) => addTreeNode(prevTree, targetDirPath, task.newNode));
        addedPaths.push(task.path);
      });

      try {
        for (const task of uploadTasks) {
          await rpcCall('fs/write_file', {
            path: task.path,
            content: task.content
          });
        }
      } catch (error) {
        console.error('Failed to upload files:', error);
        toast({
          title: t('chat:sandbox_upload_failed', '上传失败'),
          description: getErrText(error),
          status: 'error'
        });
        // 回滚
        addedPaths.forEach((path) => {
          setFileTree((prevTree) => deleteTreeNode(prevTree, path));
        });
        await refreshWorkspace({ preserveExpandedDirs: true });
      }
    },
    [fileTree, maxFileBytes, maxFileSizeMB, rpcCall, refreshWorkspace, toast, t]
  );

  // 展开折叠目录
  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory') return;

    const isExpanded = expandedDirs.has(node.path);

    if (isExpanded) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
    } else {
      // 如果未加载过，则异步加载
      if (!node.loaded) {
        await loadDirectory(node.path, node.level + 1)
          .then(() => {
            setExpandedDirs((prev) => {
              const next = new Set(prev);
              next.add(node.path);
              return next;
            });
          })
          .catch((error) => {
            console.error('Failed to load directory:', error);
          });
      } else {
        // 已加载，直接展开
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
    isWsConnected,
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
    openFile,
    closeFile,
    saveFile,
    saveAllFiles,
    downloadCurrentFile,
    onCreateNode,
    onRenameComplete,
    onMoveFile,
    onDeleteFile,
    onUploadFiles,
    toggleDirectory
  };
};
