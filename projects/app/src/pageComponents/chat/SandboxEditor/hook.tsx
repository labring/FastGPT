import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import SandboxEditorModal from '@/pageComponents/chat/SandboxEditor/modal';
import type { IconButtonProps } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  checkSandboxExist,
  listSandboxFiles,
  listSandboxFilesRecursive,
  writeSandboxFile,
  downloadSandbox,
  getSandboxFile,
  fileOpSandbox
} from './api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useContextSelector } from 'use-context-selector';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useLatest } from 'ahooks';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
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

const EXCLUDE_NAMES = ['node_modules', '.git', '.next', 'dist', 'build', '.bun'];

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
 *   3. API 结果已返回时以 API 为准；未返回前才使用历史记录兜底。
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
  }, [appId, chatId, outLinkAuthData]);

  const apiSandboxExists =
    apiSandboxStatus.appId === appId &&
    apiSandboxStatus.chatId === chatId &&
    apiSandboxStatus.exists;
  const sandboxExists = hasSandboxInHistory || apiSandboxExists;

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
            icon={<MyIcon name={'core/app/sandbox/file'} w={'16px'} />}
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

/**
 * useSandboxFileStore —— File Management Hook
 *
 * 职责：整合 Sandbox 的文件树与 Tab 状态，收拢乐观更新、异步请求及细粒度失败回滚。
 */
export const useSandboxFileStore = ({
  appId,
  chatId,
  outLinkAuthData
}: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [loadingRoot, setLoadingRoot] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);

  // 多标签页状态与选中节点路径状态
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const openedFilesRef = useLatest(openedFiles);

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
  const { runAsync: loadDirectory } = useRequest(
    async (path: string, level: number) => {
      const data = await listSandboxFiles({ appId, chatId, outLinkAuthData, path });
      const filteredFiles = (data.files || []).filter((file) => !EXCLUDE_NAMES.includes(file.name));
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
    },
    { manual: true }
  );

  /**
   * 首次刷新工作区时走递归列表接口。
   * 这样 Skill edit 打开编辑器只需要一次 API 请求，服务端也只执行一次目录扫描命令。
   */
  const refreshWorkspace = async () => {
    setLoadingRoot(true);
    try {
      const data = await listSandboxFilesRecursive({
        appId,
        chatId,
        outLinkAuthData,
        path: '.',
        excludeNames: EXCLUDE_NAMES
      });
      setFileTree(data.files);
      setExpandedDirs(new Set(data.expandedPaths));
    } catch (error) {
      console.error('Failed to refresh workspace:', error);
    } finally {
      setLoadingRoot(false);
    }
  };

  // 读取文件内容 - 根据 language 决定解码策略
  const loadFile = async (filePath: string, language: string) => {
    setLoadingFile(true);
    try {
      const response = await getSandboxFile({ appId, chatId, outLinkAuthData, path: filePath });
      const isBinary = getIsBinaryByLanguage(language);

      if (isBinary) {
        const blob = await response.blob();
        return { content: URL.createObjectURL(blob), isUnknown: false };
      }

      const buffer = await response.arrayBuffer();
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        return { content, isUnknown: false };
      } catch {
        return { content: '', isUnknown: true };
      }
    } finally {
      setLoadingFile(false);
    }
  };

  // 保存指定或当前文件
  const saveFile = useCallback(
    async (filePath?: string) => {
      const targetPath = filePath || activeFilePath;
      if (!targetPath) return;

      const targetFile = openedFilesRef.current?.find((f) => f.path === targetPath);
      if (!targetFile || targetFile.isBinary || targetFile.isUnknown) return;

      setSaving(true);
      try {
        await writeSandboxFile({
          appId,
          chatId,
          outLinkAuthData,
          path: targetPath,
          content: targetFile.content
        });

        // 标记为已保存
        setOpenedFiles((prev) =>
          prev.map((f) => (f.path === targetPath ? { ...f, isDirty: false } : f))
        );
      } catch (error) {
        console.error('Failed to save file:', error);
      } finally {
        setSaving(false);
      }
    },
    [appId, chatId, outLinkAuthData, activeFilePath, openedFilesRef]
  );

  // 批量全部保存方法
  const saveAllFiles = useCallback(async () => {
    const dirtyFiles =
      openedFilesRef.current?.filter((f) => f.isDirty && !f.isBinary && !f.isUnknown) || [];
    if (dirtyFiles.length === 0) return;

    await Promise.all(
      dirtyFiles.map(async (f) => {
        await writeSandboxFile({
          appId,
          chatId,
          outLinkAuthData,
          path: f.path,
          content: f.content
        });
      })
    );

    setOpenedFiles((prev) =>
      prev.map((f) => (dirtyFiles.some((df) => df.path === f.path) ? { ...f, isDirty: false } : f))
    );
  }, [appId, chatId, outLinkAuthData, openedFilesRef]);

  // 1.5 秒防抖自动保存脏文件
  useEffect(() => {
    const dirtyFiles = openedFiles.filter((f) => f.isDirty && !f.isBinary && !f.isUnknown);
    if (dirtyFiles.length === 0) return;

    const timer = setTimeout(() => {
      dirtyFiles.forEach((f) => {
        saveFile(f.path);
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [openedFiles, saveFile]);

  // 切换活动文件时，若前一文件为 dirty 状态则立刻保存
  const prevActiveFilePathRef = useRef<string>(activeFilePath);
  useEffect(() => {
    const prevPath = prevActiveFilePathRef.current;
    prevActiveFilePathRef.current = activeFilePath;

    if (prevPath && prevPath !== activeFilePath) {
      const prevFile = openedFilesRef.current?.find((f) => f.path === prevPath);
      if (prevFile?.isDirty) {
        saveFile(prevPath);
      }
    }
  }, [activeFilePath, openedFilesRef, saveFile]);

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
    // 检查是否已打开
    const existingFile = openedFiles.find((f) => f.path === filePath);

    if (existingFile) {
      setActiveFilePath(filePath);
      setSelectedPath(filePath);
      return;
    }

    try {
      const fileName = filePath.split('/').pop() || '';
      const language = getLanguageByFileName(fileName);
      const isBinary = getIsBinaryByLanguage(language);

      const { content, isUnknown } = await loadFile(filePath, language);

      const newFile: OpenedFile = {
        path: filePath,
        name: fileName,
        content,
        language,
        isBinary,
        isDirty: false,
        isUnknown
      };

      setOpenedFiles((prev) => [...prev, newFile]);
      setActiveFilePath(filePath);
      setSelectedPath(filePath);
    } catch (error) {
      console.error('Failed to open file:', error);
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
          return { ...f, path: f.path.replace(oldPath, newPath) };
        }
        return f;
      })
    );

    setActiveFilePath((prev) => {
      if (prev === oldPath) return newPath;
      if (prev.startsWith(oldPath + '/')) return prev.replace(oldPath, newPath);
      return prev;
    });

    setSelectedPath((prev) => {
      if (prev === oldPath) return newPath;
      if (prev.startsWith(oldPath + '/')) return prev.replace(oldPath, newPath);
      return prev;
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
  const onCreateNode = async (parentPath: string, name: string, type: 'file' | 'directory') => {
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

    // 3. 异步发送请求，若失败则回滚状态并抛出错误
    try {
      if (type === 'file') {
        await writeSandboxFile({
          appId,
          chatId,
          outLinkAuthData,
          path: fullPath,
          content: ''
        });
      } else {
        await fileOpSandbox({
          appId,
          chatId,
          outLinkAuthData,
          type: 'mkdir',
          path: fullPath
        });
      }
    } catch (error) {
      // 4. 请求失败回滚本地状态
      setFileTree((prevTree) => deleteTreeNode(prevTree, fullPath));
      if (type === 'file') {
        setOpenedFiles((prev) => {
          const filtered = prev.filter((f) => f.path !== fullPath);
          setActiveFilePath((prevActive) => {
            if (prevActive === fullPath) {
              return filtered.length > 0 ? filtered[filtered.length - 1].path : '';
            }
            return prevActive;
          });
          return filtered;
        });
      }
      throw error;
    }
  };

  // 重命名完成 (乐观更新)
  const onRenameComplete = async (oldPath: string, newName: string) => {
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

    const oldName = oldPath.split('/').pop() || '';

    // 1. 乐观更新
    updateStatePaths(oldPath, newPath, newName);
    setFileTree((prevTree) => renameTreeNodeInTree(prevTree, oldPath, newPath, newName));

    // 2. 异步请求，失败时回滚
    try {
      await fileOpSandbox({
        appId,
        chatId,
        outLinkAuthData,
        type: 'move',
        path: oldPath,
        destPath: newPath
      });
    } catch (error) {
      // 细粒度回滚状态并向上抛出错误
      updateStatePaths(newPath, oldPath, oldName);
      setFileTree((prevTree) => renameTreeNodeInTree(prevTree, newPath, oldPath, oldName));
      throw error;
    }
  };

  // 移动文件/目录（拖拽移动） (乐观更新)
  const onMoveFile = async (srcPath: string, targetDirPath: string) => {
    const parts = srcPath.split('/');
    const fileName = parts.pop() || '';
    const destPath = targetDirPath === '.' ? fileName : `${targetDirPath}/${fileName}`;

    if (srcPath === destPath) return;

    const srcParts = srcPath.split('/');
    srcParts.pop();
    const srcParentPath = srcParts.join('/') || '.';

    // 1. 乐观更新
    updateStatePaths(srcPath, destPath);
    setFileTree((prevTree) => moveTreeNodeInTree(prevTree, srcPath, targetDirPath));

    // 2. 异步请求，失败时回滚
    try {
      await fileOpSandbox({
        appId,
        chatId,
        outLinkAuthData,
        type: 'move',
        path: srcPath,
        destPath
      });
    } catch (error) {
      // 细粒度回滚状态
      updateStatePaths(destPath, srcPath);
      setFileTree((prevTree) => moveTreeNodeInTree(prevTree, destPath, srcParentPath));
      throw error;
    }
  };

  // 删除文件/目录 (非乐观更新，等待接口成功后再移除)
  const onDeleteFile = async (filePath: string) => {
    // 1. 异步请求
    await fileOpSandbox({
      appId,
      chatId,
      outLinkAuthData,
      type: 'delete',
      path: filePath
    });

    // 2. 成功后更新本地状态
    deleteStatePaths(filePath);
    setFileTree((prevTree) => deleteTreeNode(prevTree, filePath));
  };

  // 上传文件
  const onUploadFiles = async (files: FileList, targetDirPath: string) => {
    let targetLevel = 0;
    if (targetDirPath !== '.') {
      const parentNode = findNodeByPath(fileTree, targetDirPath);
      if (parentNode) {
        targetLevel = parentNode.level + 1;
      } else {
        targetLevel = targetDirPath.split('/').length;
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const language = getLanguageByFileName(file.name);
      const isBinary = getIsBinaryByLanguage(language);
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        if (isBinary) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      });
      const path = targetDirPath === '.' ? file.name : `${targetDirPath}/${file.name}`;
      await writeSandboxFile({
        appId,
        chatId,
        outLinkAuthData,
        path,
        content
      });

      const newNode: TreeNode = {
        name: file.name,
        path,
        type: 'file',
        level: targetLevel
      };
      setFileTree((prevTree) => addTreeNode(prevTree, targetDirPath, newNode));
    }
  };

  // 展开折叠目录
  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory') return;

    setSelectedPath(node.path);

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
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);
          return next;
        });

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
          })
          .finally(() => {
            setLoadingDirs((prev) => {
              const next = new Set(prev);
              next.delete(node.path);
              return next;
            });
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
    loadingFile,
    saving,
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
