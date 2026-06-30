import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  Spinner,
  Skeleton
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Trans, useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { ExecuteResult } from '@fastgpt-sdk/sandbox-adapter';
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  DragOverlay,
  useDroppable,
  pointerWithin,
  rectIntersection
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, CollisionDetection } from '@dnd-kit/core';
import FileTreeNode, { InlineCreateNode } from './FileTreeNode';
import {
  buildSandboxMoveOperations,
  findNodeByPath,
  getIconByFilename,
  getSandboxParentPath,
  getSafeSandboxCommandPath,
  getSafeSandboxPathSegment,
  getTargetDirectoryPath,
  getTopLevelSandboxPaths,
  type SandboxMoveOperation
} from '../utils';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';

// 自定义碰撞检测算法，实现根目录和空白区拖放
const customCollisionDetection: CollisionDetection = (args) => {
  // 1. 优先使用 dnd-kit 默认的 pointerWithin 判定是否悬停在某个具体文件节点上
  const pointerCollisions = pointerWithin(args);
  const hoveredSpecific = pointerCollisions.find((c) => c.id !== '.');
  if (hoveredSpecific) {
    return [hoveredSpecific];
  }

  // 2. 如果碰到了根目录 '.'，则直接返回
  const hasRoot = pointerCollisions.some((c) => c.id === '.');
  if (hasRoot) {
    return [{ id: '.' }];
  }

  // 3. 降级使用 rectIntersection 交叉计算
  const rectCollisions = rectIntersection(args);
  const specificRect = rectCollisions.find((c) => c.id !== '.');
  if (specificRect) {
    return [specificRect];
  }

  return rectCollisions;
};
import { downloadSandbox } from '../api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

export type FileItem = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: number;
};

export type TreeNode = FileItem & {
  children?: TreeNode[];
  level: number;
  loaded?: boolean;
};

type Props = {
  width?: number;
  filteredTree: TreeNode[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  activeFilePath: string;
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  openFile: (path: string) => void;
  toggleDirectory: (node: TreeNode) => Promise<void> | void;
  onCreateNode: (parentPath: string, name: string, type: 'file' | 'directory') => Promise<void>;
  onRenameComplete: (oldPath: string, newName: string) => Promise<void>;
  onMoveFiles: (
    operations: SandboxMoveOperation[],
    options?: { expandPath?: string | null }
  ) => Promise<SandboxMoveOperation[]>;
  onDeleteFile: (path: string) => Promise<void>;
  onUploadFiles: (files: FileList, targetDirPath: string) => Promise<void>;
  onExecCommand: (command: string, timeoutMs?: number) => Promise<ExecuteResult>;
  onRefreshWorkspace: (options?: { preserveExpandedDirs?: boolean }) => Promise<void>;
  setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
  sandboxTarget: ChatTargetInputType;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  showFileOps?: boolean;
  showDownload?: boolean;
  enablePathCopy?: boolean;
  enableZipExtract?: boolean;
  enableMultiSelect?: boolean;
  isLoading?: boolean;
};

const FileTreeSkeleton = () => {
  return (
    <VStack align="stretch" spacing="16px" w="full">
      <Skeleton h="16px" w="100%" borderRadius="4px" />
      <Skeleton h="16px" w="100%" borderRadius="4px" />
      <Skeleton h="16px" w="100%" borderRadius="4px" />
      <Skeleton h="16px" w="100%" borderRadius="4px" />
      <Skeleton h="16px" w="100%" borderRadius="4px" />
      <Skeleton h="16px" w="100%" borderRadius="4px" />
      <Skeleton h="16px" w="50%" borderRadius="4px" />
      <Skeleton h="16px" w="50%" borderRadius="4px" />
    </VStack>
  );
};

const buildResolveAbsolutePathsCommand = (paths: string[]) => {
  const quotedPaths = paths.map((path) => shellQuote(getSafeSandboxCommandPath(path))).join(' ');
  return [
    'workspace_root=$(pwd -P)',
    `for path in ${quotedPaths}; do`,
    '  if [ "$path" = "." ]; then',
    '    printf \'%s\\n\' "$workspace_root"',
    '  else',
    '    printf \'%s/%s\\n\' "$workspace_root" "${path#./}"',
    '  fi',
    'done'
  ].join('\n');
};

const getIsZipFile = (node: TreeNode) => node.type === 'file' && /\.zip$/i.test(node.name);

const stripZipExtension = (name: string) => name.replace(/\.zip$/i, '');

const buildExtractZipToNamedDirCommand = (params: {
  zipPath: string;
  parentPath: string;
  targetDirName: string;
}) => {
  const { zipPath, parentPath, targetDirName } = params;

  return [
    `zip_path=${shellQuote(getSafeSandboxCommandPath(zipPath))}`,
    `parent_dir=${shellQuote(getSafeSandboxCommandPath(parentPath))}`,
    `base_name=${shellQuote(getSafeSandboxPathSegment(targetDirName))}`,
    'target_dir="$parent_dir/$base_name"',
    'index=1',
    'while [ -e "$target_dir" ]; do',
    '  target_dir="$parent_dir/$base_name-$index"',
    '  index=$((index + 1))',
    'done',
    'mkdir -p "$target_dir"',
    'unzip -q "$zip_path" -d "$target_dir"',
    'printf "%s\\n" "$target_dir"'
  ].join('\n');
};

const DroppableRootBox = ({
  children,
  activeNode,
  realOverDestPath,
  onContextMenu,
  onPointerDown
}: {
  children: React.ReactNode;
  activeNode: TreeNode | null;
  realOverDestPath: string | null;
  onContextMenu: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: '.'
  });

  return (
    <Box
      ref={setNodeRef}
      flex={1}
      minH="0"
      overflowY="auto"
      overflowX="hidden"
      px={0}
      py={0}
      bg={
        isOver || (activeNode && realOverDestPath === '.')
          ? 'rgba(56, 139, 253, 0.04)'
          : 'transparent'
      }
      border={
        isOver || (activeNode && realOverDestPath === '.')
          ? '1px dashed rgba(56, 139, 253, 0.4)'
          : '1px solid transparent'
      }
      borderRadius="6px"
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
    >
      {children}
    </Box>
  );
};

const FileTree = ({
  filteredTree,
  searchQuery,
  setSearchQuery,
  expandedDirs,
  loadingDirs,
  activeFilePath,
  selectedPath,
  setSelectedPath,
  openFile,
  toggleDirectory,
  onCreateNode,
  onRenameComplete,
  onMoveFiles,
  onDeleteFile,
  onUploadFiles,
  onExecCommand,
  onRefreshWorkspace,
  setExpandedDirs,
  sandboxTarget,
  chatId,
  outLinkAuthData,
  showFileOps = true,
  showDownload = true,
  enablePathCopy = false,
  enableZipExtract = false,
  enableMultiSelect = false,
  isLoading = false
}: Props) => {
  const { t } = useTranslation(['chat', 'common']);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  const [activeNode, setActiveNode] = useState<TreeNode | null>(null);
  const [activeOverPath, setActiveOverPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const effectiveSelectedPaths = (() => {
    if (!enableMultiSelect) return selectedPaths;
    if (!selectedPath) return new Set<string>();
    return selectedPaths.has(selectedPath) ? selectedPaths : new Set([selectedPath]);
  })();

  const getOperationSelectedPaths = (basePath: string) => {
    if (enableMultiSelect && effectiveSelectedPaths.has(basePath)) {
      return getTopLevelSandboxPaths(Array.from(effectiveSelectedPaths));
    }
    return basePath === '.' ? [] : [basePath];
  };

  const selectSingleNode = (path: string) => {
    setSelectedPath(path);
    setSelectedPaths(new Set([path]));
  };

  const toggleSelectedNode = (path: string) => {
    if (!enableMultiSelect) {
      selectSingleNode(path);
      return;
    }

    const next = new Set(effectiveSelectedPaths);
    if (next.has(path)) {
      next.delete(path);
      if (next.size === 0) {
        next.add(path);
        setSelectedPath(path);
      } else {
        const remainingPaths = Array.from(next);
        setSelectedPath(remainingPaths[remainingPaths.length - 1] || '');
      }
    } else {
      next.add(path);
      setSelectedPath(path);
    }
    setSelectedPaths(next);
  };

  const getRealOverDestPath = () => {
    if (!activeOverPath) return null;
    if (activeOverPath === '.') return '.';
    const node = findNodeByPath(filteredTree, activeOverPath);
    if (node && node.type === 'file') {
      return getSandboxParentPath(activeOverPath);
    }
    return activeOverPath;
  };
  const realOverDestPath = getRealOverDestPath();

  const handleDragStart = (event: DragStartEvent) => {
    const node = event.active.data.current?.node as TreeNode | undefined;
    if (node) {
      if (!enableMultiSelect || !effectiveSelectedPaths.has(node.path)) {
        selectSingleNode(node.path);
      } else {
        setSelectedPath(node.path);
      }
      setActiveNode(node);
      setActiveOverPath(null);
    }
  };

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingNode, setCreatingNode] = useState<{
    parentPath: string;
    type: 'file' | 'directory';
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNode;
  } | null>(null);
  const { openConfirm, ConfirmModal } = useConfirm();
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const treeRootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (treeRootRef.current?.contains(target) || menuRef.current?.contains(target)) return;

      setSelectedPath('');
      setSelectedPaths(new Set());
    };

    window.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => window.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [setSelectedPath]);

  // 点击任意地方关闭右键菜单（支持捕获阶段并过滤菜单内部点击，防止阻止冒泡导致菜单无法关闭）
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleOutsideClick, true);
    return () => window.removeEventListener('click', handleOutsideClick, true);
  }, [contextMenu]);

  // 新建/重命名事件回调
  const handleRenameComplete = async (path: string, newName: string) => {
    setRenamingPath(null);
    try {
      await onRenameComplete(path, newName);
    } catch (error) {
      toast({
        title: t('chat:sandbox_rename_failed'),
        description: getErrText(error),
        status: 'error'
      });
    }
  };

  const handleConfirmCreate = async (name: string) => {
    if (!creatingNode) return;
    const { parentPath, type } = creatingNode;
    setCreatingNode(null);
    try {
      await onCreateNode(parentPath, name, type);
    } catch (error) {
      toast({
        title: t('chat:sandbox_create_failed'),
        description: getErrText(error),
        status: 'error'
      });
    }
  };

  // 拖放移动完成
  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveNode(null);
    setActiveOverPath(null);
    const { active, over } = event;
    if (!over) return;

    const srcPath = active.id as string;
    const overId = over.id as string;

    // 如果落点是个文件，则取该文件所在的父级文件夹作为最终移动的目的地，支持移入相应目录或根目录
    let destDirPath = overId;
    if (overId !== '.') {
      const overNode = findNodeByPath(filteredTree, overId);
      if (overNode && overNode.type === 'file') {
        destDirPath = getSandboxParentPath(overId);
      }
    }

    const sourcePaths = getOperationSelectedPaths(srcPath);
    if (sourcePaths.length === 0) return;

    if (
      sourcePaths.some(
        (sourcePath) => destDirPath === sourcePath || destDirPath.startsWith(sourcePath + '/')
      )
    ) {
      toast({
        title: t('chat:sandbox_move_failed'),
        description: t('chat:sandbox_move_into_self_forbidden'),
        status: 'warning'
      });
      return;
    }

    const movePlan = buildSandboxMoveOperations(sourcePaths, destDirPath);
    const moveItems = movePlan;

    if (moveItems.length === 0) return;

    // 校验重名冲突：目标路径是否已经存在同名节点
    const newPathSet = new Set<string>();
    const hasConflict =
      moveItems.some((item) => {
        if (newPathSet.has(item.newPath)) return true;
        newPathSet.add(item.newPath);
        return false;
      }) || moveItems.some((item) => findNodeByPath(filteredTree, item.newPath));
    if (hasConflict) {
      toast({
        title: t('chat:sandbox_move_failed'),
        description: t('chat:sandbox_file_already_exists'),
        status: 'warning'
      });
      return;
    }

    const destNode = findNodeByPath(filteredTree, destDirPath);
    const shouldExpandDest = destDirPath !== '.' && destNode && destNode.loaded;

    try {
      const movedItems = await onMoveFiles(moveItems, {
        expandPath: shouldExpandDest ? destDirPath : null
      });

      const movedPathMap = new Map(movedItems.map((item) => [item.sourcePath, item.newPath]));
      const activeMovedPath = movedPathMap.get(srcPath);
      const nextSelectedPath =
        activeMovedPath || movePlan.find((item) => item.sourcePath === srcPath)?.sourcePath || '';
      setSelectedPaths(
        new Set(movePlan.map((item) => movedPathMap.get(item.sourcePath) || item.sourcePath))
      );
      setSelectedPath(nextSelectedPath);
    } catch (error) {
      const movedItems =
        error instanceof Error && 'movedItems' in error
          ? ((error as Error & { movedItems?: typeof moveItems }).movedItems ?? [])
          : [];
      if (movedItems.length > 0) {
        const movedPathMap = new Map(movedItems.map((item) => [item.sourcePath, item.newPath]));
        setSelectedPaths(
          new Set(movePlan.map((item) => movedPathMap.get(item.sourcePath) || item.sourcePath))
        );
        const nextSelectedPath = movedPathMap.get(srcPath) || srcPath;
        setSelectedPath(nextSelectedPath);
      }
    }
  };

  // 根据当前选中态，自动计算目标父文件夹路径
  const getTargetDirPathFromSelected = () => {
    return getTargetDirectoryPath(filteredTree, selectedPath);
  };

  // 上端控制区触发
  const triggerCreateInSelected = async (type: 'file' | 'directory') => {
    const parentPath = getTargetDirPathFromSelected();

    // 自动展开目标目录
    if (parentPath !== '.') {
      const parentNode = findNodeByPath(filteredTree, parentPath);
      if (parentNode && !parentNode.loaded) {
        await toggleDirectory(parentNode);
      } else {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(parentPath);
          return next;
        });
      }
    }

    setCreatingNode({ parentPath, type });
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const targetDirPath = getTargetDirPathFromSelected();

    try {
      setIsUploading(true);
      await onUploadFiles(files, targetDirPath);
    } catch (error) {
      toast({
        title: t('chat:sandbox_upload_failed'),
        description: getErrText(error),
        status: 'error'
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCollapseAll = () => {
    setExpandedDirs(new Set());
  };

  const getContextSelectedPaths = () => {
    if (!contextMenu) return [];
    if (enableMultiSelect && effectiveSelectedPaths.has(contextMenu.node.path)) {
      return Array.from(effectiveSelectedPaths);
    }
    return [contextMenu.node.path];
  };

  // 右键菜单动作分发
  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    if (node.path === '.') {
      if (!showFileOps) return;
    }
    if (enableMultiSelect && effectiveSelectedPaths.has(node.path)) {
      setSelectedPath(node.path);
    } else {
      selectSingleNode(node.path);
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node
    });
  };

  const handleBlankContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!showFileOps) return;
    selectSingleNode('.');
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node: {
        name: t('chat:sandbox_root_directory'),
        path: '.',
        type: 'directory',
        level: 0
      }
    });
  };

  const handleTreeBlankPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target || target.closest('[data-file-tree-node="true"]')) return;

    setSelectedPath('');
    setSelectedPaths(new Set());
  };

  const handleCtxCreateFile = async () => {
    if (!contextMenu) return;
    const node = contextMenu.node;
    const parentPath = node.type === 'directory' ? node.path : getSandboxParentPath(node.path);

    if (parentPath !== '.') {
      const parentNode = findNodeByPath(filteredTree, parentPath);
      if (parentNode && !parentNode.loaded) {
        await toggleDirectory(parentNode);
      } else {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(parentPath);
          return next;
        });
      }
    }
    setCreatingNode({ parentPath, type: 'file' });
    setContextMenu(null);
  };

  const handleCtxCreateDir = async () => {
    if (!contextMenu) return;
    const node = contextMenu.node;
    const parentPath = node.type === 'directory' ? node.path : getSandboxParentPath(node.path);

    if (parentPath !== '.') {
      const parentNode = findNodeByPath(filteredTree, parentPath);
      if (parentNode && !parentNode.loaded) {
        await toggleDirectory(parentNode);
      } else {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(parentPath);
          return next;
        });
      }
    }
    setCreatingNode({ parentPath, type: 'directory' });
    setContextMenu(null);
  };

  const handleCtxRename = () => {
    if (!contextMenu) return;
    setRenamingPath(contextMenu.node.path);
    setContextMenu(null);
  };

  const handleCtxDelete = () => {
    if (!contextMenu) return;
    const node = contextMenu.node;
    const deletePaths = getOperationSelectedPaths(node.path);
    if (deletePaths.length === 0) return;

    const deleteName =
      deletePaths.length > 1
        ? t('chat:sandbox_selected_items_count', { count: deletePaths.length })
        : node.name;
    setContextMenu(null);
    openConfirm({
      title: t('chat:sandbox_confirm_delete_title'),
      customContent: (
        <Trans
          i18nKey={i18nT('chat:sandbox_confirm_delete_content')}
          values={{ name: deleteName }}
          components={{
            name: <Text as="span" fontWeight="600" color="red.600" />
          }}
        />
      ),
      confirmButtonVariant: 'dangerFill',
      onConfirm: async () => {
        try {
          for (const path of deletePaths) {
            await onDeleteFile(path);
            setSelectedPaths(
              (prev) =>
                new Set(
                  Array.from(prev).filter(
                    (selectedPath) => selectedPath !== path && !selectedPath.startsWith(path + '/')
                  )
                )
            );
          }
          setSelectedPaths(new Set());
        } catch (error) {
          throw error;
        }
      }
    })();
  };

  const handleCtxDownload = async () => {
    if (!contextMenu) return;
    const paths = getContextSelectedPaths();
    setContextMenu(null);
    try {
      for (const path of paths) {
        await downloadSandbox({
          ...sandboxTarget,
          chatId,
          outLinkAuthData,
          path
        });
      }
    } catch (error) {
      toast({
        title: t('chat:sandbox_download_failed'),
        description: getErrText(error),
        status: 'error'
      });
    }
  };

  const handleCtxCopyAbsolutePath = async () => {
    if (!contextMenu) return;
    const selectedPaths = getContextSelectedPaths();
    setContextMenu(null);

    try {
      const result = await onExecCommand(buildResolveAbsolutePathsCommand(selectedPaths), 5000);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || t('chat:sandbox_copy_path_failed'));
      }

      const stdout = result.stdout.replace(/\r?\n$/, '');
      const absolutePaths = stdout ? stdout.split(/\r?\n/) : [];
      if (absolutePaths.length !== selectedPaths.length) {
        throw new Error(t('chat:sandbox_copy_path_failed'));
      }

      await navigator.clipboard.writeText(absolutePaths.join('\n'));
      toast({
        title: t('chat:sandbox_copy_path_success'),
        status: 'success'
      });
    } catch (error) {
      toast({
        title: t('chat:sandbox_copy_path_failed'),
        description: getErrText(error),
        status: 'error'
      });
    }
  };

  const handleCtxExtractZip = async () => {
    if (!contextMenu || !getIsZipFile(contextMenu.node)) return;
    const path = contextMenu.node.path;
    setContextMenu(null);

    const parentPath = getSandboxParentPath(path);

    try {
      const result = await onExecCommand(
        buildExtractZipToNamedDirCommand({
          zipPath: path,
          parentPath,
          targetDirName: stripZipExtension(contextMenu.node.name)
        }),
        30000
      );

      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || t('chat:sandbox_unzip_failed'));
      }

      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (parentPath !== '.') {
          next.add(parentPath);
        }
        return next;
      });
      await onRefreshWorkspace({ preserveExpandedDirs: true });

      toast({
        title: t('chat:sandbox_unzip_success'),
        status: 'success'
      });
    } catch (error) {
      toast({
        title: t('chat:sandbox_unzip_failed'),
        description: getErrText(error),
        status: 'error'
      });
    }
  };

  const renderTreeNodes = (nodes: TreeNode[]): React.ReactNode => {
    return nodes.map((node) => (
      <FileTreeNode
        key={node.path}
        node={node}
        expandedDirs={expandedDirs}
        loadingDirs={loadingDirs}
        activeFilePath={activeFilePath}
        selectedPath={selectedPath}
        selectedPaths={effectiveSelectedPaths}
        selectSingleNode={selectSingleNode}
        toggleSelectedNode={toggleSelectedNode}
        realOverDestPath={realOverDestPath}
        openFile={openFile}
        toggleDirectory={toggleDirectory}
        renamingPath={renamingPath}
        setRenamingPath={setRenamingPath}
        onRenameComplete={handleRenameComplete}
        onContextMenu={handleContextMenu}
        creatingNode={creatingNode}
        renderTreeNodes={renderTreeNodes}
        onConfirmCreate={handleConfirmCreate}
        onCancelCreate={() => setCreatingNode(null)}
        showFileOps={showFileOps}
        enableMultiSelect={enableMultiSelect}
      />
    ));
  };

  const contextSelectedPaths = getContextSelectedPaths();
  const isMultiContextMenu = contextSelectedPaths.length > 1;
  const showContextSingleNodeOps = !isMultiContextMenu;

  return (
    <Box
      ref={treeRootRef}
      flex="1"
      w="100%"
      h="full"
      bg="transparent"
      display="flex"
      flexDirection="column"
      position="relative"
      gap="12px"
    >
      {/* 隐藏的文件上传 Input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* 顶部标题与快捷操作区 */}
      <Flex px={0} pt={0} pb={0} align="center" justify="space-between">
        <Text fontSize="14px" fontWeight="600" color="myGray.800">
          {t('chat:sandbox_file_config')}
        </Text>
        <Flex
          gap="2px"
          align="center"
          pointerEvents={isLoading ? 'none' : 'auto'}
          opacity={isLoading ? 0.4 : 1}
          transition="all 0.2s"
        >
          {showFileOps && (
            <>
              <MyTooltip label={t('chat:sandbox_new_file')}>
                <Flex
                  align="center"
                  justify="center"
                  w="24px"
                  h="24px"
                  borderRadius="6px"
                  _hover={{ bg: 'rgba(15, 23, 42, 0.05)' }}
                  cursor="pointer"
                  onClick={() => triggerCreateInSelected('file')}
                  transition="background 0.2s"
                >
                  <MyIcon
                    name="core/app/sandbox/newFile"
                    fill="none"
                    w="16px"
                    h="16px"
                    color="#475569"
                  />
                </Flex>
              </MyTooltip>
              <MyTooltip label={t('chat:sandbox_new_folder')}>
                <Flex
                  align="center"
                  justify="center"
                  w="24px"
                  h="24px"
                  borderRadius="6px"
                  _hover={{ bg: 'rgba(15, 23, 42, 0.05)' }}
                  cursor="pointer"
                  onClick={() => triggerCreateInSelected('directory')}
                  transition="background 0.2s"
                >
                  <MyIcon
                    name="core/app/sandbox/newFolder"
                    fill="none"
                    w="16px"
                    h="16px"
                    color="#475569"
                  />
                </Flex>
              </MyTooltip>
              <MyTooltip
                label={isUploading ? t('chat:sandbox_uploading') : t('chat:sandbox_upload_file')}
              >
                <Flex
                  align="center"
                  justify="center"
                  w="24px"
                  h="24px"
                  borderRadius="6px"
                  _hover={{ bg: 'rgba(15, 23, 42, 0.05)' }}
                  cursor="pointer"
                  onClick={handleUploadClick}
                  transition="background 0.2s"
                >
                  {isUploading ? (
                    <Spinner size="xs" color="myGray.500" w="12px" h="12px" />
                  ) : (
                    <MyIcon
                      name="core/app/sandbox/upload"
                      fill="none"
                      w="16px"
                      h="16px"
                      color="#475569"
                    />
                  )}
                </Flex>
              </MyTooltip>
            </>
          )}
          <MyTooltip label={t('chat:sandbox_collapse_all')}>
            <Flex
              align="center"
              justify="center"
              w="24px"
              h="24px"
              borderRadius="6px"
              _hover={{ bg: 'rgba(15, 23, 42, 0.05)' }}
              cursor="pointer"
              onClick={handleCollapseAll}
              transition="background 0.2s"
            >
              <MyIcon
                name="core/app/sandbox/collapseAll"
                fill="none"
                w="16px"
                h="16px"
                color="#475569"
              />
            </Flex>
          </MyTooltip>
        </Flex>
      </Flex>

      {/* 搜索框 */}
      <Box px={0} py={0}>
        <InputGroup size="sm">
          <InputLeftElement h="32px">
            <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
          </InputLeftElement>
          <Input
            placeholder={t('chat:sandbox_search_files', '搜索文件')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            bg="white"
            fontSize="12px"
            h="32px"
            borderRadius="sm"
            border="1px solid"
            borderColor="myGray.200"
            _focus={{ bg: 'white', borderColor: 'primary.500', boxShadow: 'none' }}
            _placeholder={{ color: 'myGray.500' }}
            isDisabled={isLoading}
          />
        </InputGroup>
      </Box>

      {/* Dnd-kit 包裹的列表 */}
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={(event) => {
          setActiveOverPath(event.over?.id ? String(event.over.id) : null);
        }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveNode(null);
          setActiveOverPath(null);
        }}
      >
        <DroppableRootBox
          activeNode={activeNode}
          realOverDestPath={realOverDestPath}
          onContextMenu={handleBlankContextMenu}
          onPointerDown={handleTreeBlankPointerDown}
        >
          {isLoading ? (
            <FileTreeSkeleton />
          ) : (
            <VStack align="stretch" spacing={0} pb={2}>
              {renderTreeNodes(filteredTree)}
              {creatingNode && creatingNode.parentPath === '.' && (
                <InlineCreateNode
                  level={0}
                  type={creatingNode.type}
                  onConfirm={handleConfirmCreate}
                  onCancel={() => setCreatingNode(null)}
                />
              )}
            </VStack>
          )}
        </DroppableRootBox>

        <DragOverlay>
          {activeNode ? (
            <Box
              opacity={0.85}
              boxShadow="0px 8px 24px rgba(15, 23, 42, 0.12)"
              bg="white"
              borderRadius="6px"
              border="1px solid"
              borderColor="myGray.200"
              pointerEvents="none"
              display="flex"
              alignItems="center"
              fontSize="13px"
              color="#1E293B"
              px={3}
              py="6px"
              w="180px"
            >
              {activeNode.type === 'directory' ? (
                <MyIcon
                  name="core/app/sandbox/folderLine"
                  w="16px"
                  h="16px"
                  color="#64748B"
                  mr="8px"
                />
              ) : (
                <MyIcon
                  name={getIconByFilename(activeNode.name)}
                  fill="none"
                  w="16px"
                  h="16px"
                  color="#64748B"
                  mr="8px"
                />
              )}
              <Text
                noOfLines={1}
                fontWeight="500"
                flex={1}
                overflow="hidden"
                textOverflow="ellipsis"
              >
                {activeNode.name}
              </Text>
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 自定义右键菜单 */}
      {contextMenu && (
        <Box
          ref={menuRef}
          position="fixed"
          top={`${contextMenu.y}px`}
          left={`${contextMenu.x}px`}
          bg="white"
          boxShadow="0px 4px 16px rgba(15, 23, 42, 0.12)"
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="md"
          py={1}
          zIndex={9999}
          minW="130px"
          onClick={(e) => e.stopPropagation()}
        >
          {showFileOps && (
            <>
              <ContextMenuItem label={t('chat:sandbox_new_file')} onClick={handleCtxCreateFile} />
              <ContextMenuItem label={t('chat:sandbox_new_folder')} onClick={handleCtxCreateDir} />
            </>
          )}
          {contextMenu.node.path === '.' && showDownload && (
            <>
              {showFileOps && <Box borderBottom="1px solid" borderColor="myGray.100" my={1} />}
              <ContextMenuItem label={t('chat:sandbox_download_all')} onClick={handleCtxDownload} />
            </>
          )}
          {contextMenu.node.path !== '.' && (
            <>
              {showFileOps && <Box borderBottom="1px solid" borderColor="myGray.100" my={1} />}
              {showContextSingleNodeOps && showFileOps && (
                <ContextMenuItem label={t('chat:sandbox_rename')} onClick={handleCtxRename} />
              )}
              {enablePathCopy && (
                <ContextMenuItem
                  label={t('chat:sandbox_copy_absolute_path')}
                  onClick={handleCtxCopyAbsolutePath}
                />
              )}
              {showContextSingleNodeOps &&
                showFileOps &&
                enableZipExtract &&
                getIsZipFile(contextMenu.node) && (
                  <ContextMenuItem label={t('chat:sandbox_unzip')} onClick={handleCtxExtractZip} />
                )}
              {showDownload && (
                <ContextMenuItem label={t('chat:sandbox_download')} onClick={handleCtxDownload} />
              )}
              {showFileOps && (
                <>
                  {(showContextSingleNodeOps || enablePathCopy || showDownload) && (
                    <Box borderBottom="1px solid" borderColor="myGray.100" my={1} />
                  )}
                  <ContextMenuItem
                    label={t('chat:sandbox_delete')}
                    onClick={handleCtxDelete}
                    isDanger
                  />
                </>
              )}
            </>
          )}
        </Box>
      )}

      {/* 删除确认弹窗 */}
      <ConfirmModal />
    </Box>
  );
};

// 辅助右键菜单项组件
const ContextMenuItem = ({
  label,
  onClick,
  isDanger = false
}: {
  label: string;
  onClick: () => void;
  isDanger?: boolean;
}) => (
  <Flex
    px={3}
    py="6px"
    cursor="pointer"
    _hover={{ bg: isDanger ? 'red.50' : 'rgba(15, 23, 42, 0.05)' }}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    align="center"
    fontSize="13px"
    color={isDanger ? 'red.500' : 'myGray.700'}
    userSelect={'none'}
  >
    <Text>{label}</Text>
  </Flex>
);

export default FileTree;
