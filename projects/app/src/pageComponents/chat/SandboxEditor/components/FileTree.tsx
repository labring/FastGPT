import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  Spinner
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Trans, useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
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
import { getIconByFilename } from '../utils';

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
  onMoveFile: (srcPath: string, targetDirPath: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onUploadFiles: (files: FileList, targetDirPath: string) => Promise<void>;
  setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
  appId: string;
  chatId: string;
  outLinkAuthData?: any;
  showFileOps?: boolean;
};

const DroppableRootBox = ({
  children,
  activeNode,
  realOverDestPath,
  onContextMenu
}: {
  children: React.ReactNode;
  activeNode: TreeNode | null;
  realOverDestPath: string | null;
  onContextMenu: (e: React.MouseEvent) => void;
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
      px={2}
      py={1}
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
    >
      {children}
    </Box>
  );
};

const FileTree = ({
  width = 250,
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
  onMoveFile,
  onDeleteFile,
  onUploadFiles,
  setExpandedDirs,
  appId,
  chatId,
  outLinkAuthData,
  showFileOps = true
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

  const findNodeByPath = (nodes: TreeNode[], targetPath: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.path === targetPath) return node;
      if (node.children) {
        const res = findNodeByPath(node.children, targetPath);
        if (res) return res;
      }
    }
    return null;
  };

  const getParentPath = (path: string) => {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '.';
  };

  const getRealOverDestPath = () => {
    if (!activeOverPath) return null;
    if (activeOverPath === '.') return '.';
    const node = findNodeByPath(filteredTree, activeOverPath);
    if (node && node.type === 'file') {
      return getParentPath(activeOverPath);
    }
    return activeOverPath;
  };
  const realOverDestPath = getRealOverDestPath();

  const handleDragStart = (event: DragStartEvent) => {
    const node = event.active.data.current?.node as TreeNode | undefined;
    if (node) {
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
  const menuRef = useRef<HTMLDivElement>(null);

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
        destDirPath = getParentPath(overId);
      }
    }

    if (destDirPath === srcPath || destDirPath.startsWith(srcPath + '/')) {
      toast({
        title: t('chat:sandbox_move_failed'),
        description: t('chat:sandbox_move_into_self_forbidden'),
        status: 'warning'
      });
      return;
    }

    const lastSlash = srcPath.lastIndexOf('/');
    const currentParentPath = lastSlash === -1 ? '.' : srcPath.substring(0, lastSlash);
    if (currentParentPath === destDirPath) {
      return;
    }

    // 计算移动后的新绝对路径，并在前端同步更新展开的文件夹列表状态，防止移动后因路径失效导致文件夹自动折叠
    const srcName = srcPath.substring(lastSlash + 1);
    const newPath = destDirPath === '.' ? srcName : `${destDirPath}/${srcName}`;

    // 校验重名冲突：目标路径是否已经存在同名节点
    const conflictNode = findNodeByPath(filteredTree, newPath);
    if (conflictNode) {
      toast({
        title: t('chat:sandbox_move_failed'),
        description: t('chat:sandbox_file_already_exists'),
        status: 'warning'
      });
      return;
    }

    const destNode = findNodeByPath(filteredTree, destDirPath);
    const shouldExpandDest = destDirPath !== '.' && destNode && destNode.loaded;

    setExpandedDirs((prev) => {
      const next = new Set<string>();
      prev.forEach((path) => {
        if (path === srcPath) {
          next.add(newPath);
        } else if (path.startsWith(srcPath + '/')) {
          next.add(newPath + path.substring(srcPath.length));
        } else {
          next.add(path);
        }
      });
      if (shouldExpandDest) {
        next.add(destDirPath);
      }
      return next;
    });

    try {
      await onMoveFile(srcPath, destDirPath);
    } catch (error) {
      toast({
        title: t('chat:sandbox_move_failed'),
        description: getErrText(error),
        status: 'error'
      });
    }
  };

  // 根据当前选中态，自动计算目标父文件夹路径
  const getTargetDirPathFromSelected = () => {
    let parentPath = '.';
    if (selectedPath) {
      if (selectedPath === '.') {
        parentPath = '.';
      } else {
        const selectedNode = findNodeByPath(filteredTree, selectedPath);
        if (selectedNode) {
          if (selectedNode.type === 'directory') {
            parentPath = selectedPath;
          } else {
            parentPath = getParentPath(selectedPath);
          }
        } else {
          const isFile = selectedPath.includes('.') && !selectedPath.startsWith('.');
          if (isFile) {
            parentPath = getParentPath(selectedPath);
          } else {
            parentPath = selectedPath;
          }
        }
      }
    }
    return parentPath;
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

  // 右键菜单动作分发
  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    if (node.path === '.') {
      if (!showFileOps) return;
    }
    setSelectedPath(node.path);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node
    });
  };

  const handleBlankContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!showFileOps) return;
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

  const handleCtxCreateFile = async () => {
    if (!contextMenu) return;
    const node = contextMenu.node;
    const parentPath = node.type === 'directory' ? node.path : getParentPath(node.path);

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
    const parentPath = node.type === 'directory' ? node.path : getParentPath(node.path);

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
    setContextMenu(null);
    openConfirm({
      title: t('chat:sandbox_confirm_delete_title'),
      customContent: (
        <Trans
          i18nKey="chat:sandbox_confirm_delete_content"
          values={{ name: node.name }}
          components={{
            name: <Text as="span" fontWeight="600" color="red.600" />
          }}
        />
      ),
      confirmButtonVariant: 'dangerFill',
      onConfirm: async () => {
        try {
          await onDeleteFile(node.path);
        } catch (error) {
          toast({
            title: t('chat:sandbox_delete_failed'),
            description: getErrText(error),
            status: 'error'
          });
          throw error;
        }
      }
    })();
  };

  const handleCtxDownload = async () => {
    if (!contextMenu) return;
    const path = contextMenu.node.path;
    setContextMenu(null);
    try {
      await downloadSandbox({
        appId,
        chatId,
        outLinkAuthData,
        path: path
      });
    } catch (error) {
      toast({
        title: t('chat:sandbox_download_failed'),
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
        setSelectedPath={setSelectedPath}
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
      />
    ));
  };

  return (
    <Box
      flex="0 0 auto"
      w={`${width}px`}
      h="full"
      bg="white"
      display="flex"
      flexDirection="column"
      position="relative"
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
      <Flex px={4} pt={4} pb={2} align="center" justify="space-between">
        <Text fontSize="14px" fontWeight="600" color="myGray.800">
          {t('chat:sandbox_file_config')}
        </Text>
        <Flex gap="2px" align="center">
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
      <Box px={3} py={2}>
        <InputGroup size="sm">
          <InputLeftElement h="32px">
            <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
          </InputLeftElement>
          <Input
            placeholder={t('chat:sandbox_search_workspace_files')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            bg="myGray.50"
            fontSize="12px"
            h="32px"
            borderRadius="6px"
            border="none"
            _focus={{ bg: 'white', boxShadow: '0 0 0 1px #CBD5E1' }}
            _placeholder={{ color: 'myGray.500' }}
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
        >
          <VStack align="stretch" spacing="2px" pb={2}>
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
                <MyIcon name="core/app/sandbox/folderLine" w="16px" color="#64748B" mr="8px" />
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
          {contextMenu.node.path !== '.' && (
            <>
              {showFileOps && <Box borderBottom="1px solid" borderColor="myGray.100" my={1} />}
              {showFileOps && (
                <ContextMenuItem label={t('chat:sandbox_rename')} onClick={handleCtxRename} />
              )}
              <ContextMenuItem label={t('chat:sandbox_download')} onClick={handleCtxDownload} />
              {showFileOps && (
                <>
                  <Box borderBottom="1px solid" borderColor="myGray.100" my={1} />
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
