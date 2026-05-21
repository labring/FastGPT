import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box,
  VStack,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  Spinner,
  IconButton,
  Tooltip
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getIconByFilename } from '../utils';

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
  filteredTree: TreeNode[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  activeFilePath: string;
  openFile: (path: string) => void;
  toggleDirectory: (node: TreeNode) => void;
  canWrite: boolean;
  // 写操作（canWrite 为 true 时启用）
  onCreateFile?: (parentDir: string) => void;
  onCreateFolder?: (parentDir: string) => void;
  onUploadFiles?: (parentDir: string, files: File[]) => void;
  onRename?: (node: TreeNode) => void;
  onDelete?: (node: TreeNode) => void;
};

const FileTree = ({
  filteredTree,
  searchQuery,
  setSearchQuery,
  expandedDirs,
  loadingDirs,
  activeFilePath,
  openFile,
  toggleDirectory,
  canWrite,
  onCreateFile,
  onCreateFolder,
  onUploadFiles,
  onRename,
  onDelete
}: Props) => {
  const { t } = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const contextMenuUploadRef = useRef<HTMLInputElement>(null);
  const contextMenuUploadDirRef = useRef<string>('');

  type ContextMenuState = { x: number; y: number; node: TreeNode };
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Close context menu on any click outside
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => closeContextMenu();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu, closeContextMenu]);

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      onUploadFiles?.('', files);
    }
    e.target.value = '';
  };

  const handleContextMenuUpload = () => {
    contextMenuUploadRef.current?.click();
  };

  const handleContextMenuUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0 && contextMenuUploadDirRef.current) {
      onUploadFiles?.(contextMenuUploadDirRef.current, files);
    }
    e.target.value = '';
  };

  const handleContextMenuAction = (
    action: 'newFile' | 'newFolder' | 'upload' | 'rename' | 'delete',
    node: TreeNode
  ) => {
    closeContextMenu();
    switch (action) {
      case 'newFile':
        onCreateFile?.(node.path);
        break;
      case 'newFolder':
        onCreateFolder?.(node.path);
        break;
      case 'upload':
        contextMenuUploadDirRef.current = node.path;
        handleContextMenuUpload();
        break;
      case 'rename':
        onRename?.(node);
        break;
      case 'delete':
        onDelete?.(node);
        break;
    }
  };

  const renderTreeNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path);
    const isLoading = loadingDirs.has(node.path);
    const isActive = activeFilePath === node.path;

    const shouldShowArrow =
      node.type === 'directory' && (!node.loaded || (node.children && node.children.length > 0));

    return (
      <React.Fragment key={node.path}>
        <Flex
          pl={`${node.level * 16 + 4}px`}
          pr={2}
          py="6px"
          cursor="pointer"
          _hover={{ bg: 'rgba(17, 24, 36, 0.05)', '.row-actions': { visibility: 'visible' } }}
          bg={isActive ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
          borderRadius="4px"
          onClick={() => {
            if (node.type === 'file') {
              openFile(node.path);
            } else {
              toggleDirectory(node);
            }
          }}
          onContextMenu={(e) => {
            if (!canWrite) return;
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, node });
          }}
          align="center"
          fontSize="12px"
          color={'myGray.600'}
        >
          <Flex justify="center" align="center" w="16px" h="16px">
            {shouldShowArrow ? (
              isLoading ? (
                <Spinner size="xs" color="primary.400" w="12px" h="12px" />
              ) : (
                <MyIcon
                  name={isExpanded ? 'core/chat/chevronDown' : 'core/chat/chevronRight'}
                  w="16px"
                  color="myGray.500"
                />
              )
            ) : null}
          </Flex>
          <MyIcon
            mr={1}
            ml={1}
            name={node.type === 'directory' ? 'common/folderFill' : getIconByFilename(node.name)}
            w="16px"
            color={node.type === 'directory' ? '#EF7623' : 'myGray.600'}
          />
          <Text
            flex={1}
            minW={0}
            noOfLines={1}
            overflow="hidden"
            textOverflow="ellipsis"
            fontWeight={isActive ? '600' : '400'}
            letterSpacing="0.5px"
          >
            {node.name}
          </Text>
          {canWrite && (
            <Flex
              className="row-actions"
              gap={0.5}
              visibility="hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip label={t('skill:editor_rename')} placement="top" hasArrow openDelay={300}>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Rename"
                  icon={<MyIcon name="edit" w="12px" />}
                  onClick={() => onRename?.(node)}
                />
              </Tooltip>
              <Tooltip label={t('skill:editor_delete')} placement="top" hasArrow openDelay={300}>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Delete"
                  icon={<MyIcon name="delete" w="12px" color="red.500" />}
                  onClick={() => onDelete?.(node)}
                />
              </Tooltip>
            </Flex>
          )}
        </Flex>
        {shouldShowArrow && isExpanded && node.children && node.children.map(renderTreeNode)}
      </React.Fragment>
    );
  };

  return (
    <Box
      flex="0 0 224px"
      w={0}
      borderRight="1px solid"
      borderColor="myGray.200"
      bg="myGray.25"
      display="flex"
      flexDirection="column"
    >
      <Box p={3} pb={2}>
        <InputGroup size="sm">
          <InputLeftElement h="32px">
            <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
          </InputLeftElement>
          <Input
            placeholder={t('skill:editor_search_files')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            bg="white"
            fontSize="12px"
            h="32px"
            borderRadius="6px"
            borderColor="myGray.200"
            _placeholder={{ color: 'myGray.500' }}
          />
        </InputGroup>
      </Box>

      {canWrite && (
        <Flex px={3} pb={2} gap={1.5}>
          <Tooltip label={t('skill:editor_new_file')} placement="bottom" hasArrow openDelay={300}>
            <IconButton
              size="xs"
              variant="whiteBase"
              aria-label="New file"
              icon={<MyIcon name="common/addLight" w="12px" />}
              onClick={() => onCreateFile?.('')}
            />
          </Tooltip>
          <Tooltip label={t('skill:editor_new_folder')} placement="bottom" hasArrow openDelay={300}>
            <IconButton
              size="xs"
              variant="whiteBase"
              aria-label="New folder"
              icon={<MyIcon name="common/folderFill" w="12px" />}
              onClick={() => onCreateFolder?.('')}
            />
          </Tooltip>
          <Tooltip label={t('skill:editor_upload')} placement="bottom" hasArrow openDelay={300}>
            <IconButton
              size="xs"
              variant="whiteBase"
              aria-label="Upload"
              icon={<MyIcon name="file/uploadFile" w="14px" />}
              onClick={handleUploadClick}
            />
          </Tooltip>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleUploadChange}
          />
        </Flex>
      )}

      <Box flex={1} overflowY="auto" overflowX="hidden" px={2}>
        <VStack align="stretch" spacing="0" pb={2}>
          {filteredTree.map(renderTreeNode)}
        </VStack>
      </Box>

      {/* Hidden file input for context menu upload */}
      <input
        ref={contextMenuUploadRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleContextMenuUploadChange}
      />

      {/* Context menu */}
      {contextMenu && (
        <Box
          position="fixed"
          top={`${contextMenu.y}px`}
          left={`${contextMenu.x}px`}
          bg="white"
          borderRadius="md"
          boxShadow="0px 2px 8px 0px rgba(0, 0, 0, 0.15)"
          py={1}
          minW="140px"
          zIndex={1500}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.type === 'directory' ? (
            <>
              <ContextMenuItem
                icon="common/addLight"
                label={t('skill:editor_new_file')}
                onClick={() => handleContextMenuAction('newFile', contextMenu.node)}
              />
              <ContextMenuItem
                icon="common/folderFill"
                label={t('skill:editor_new_folder')}
                onClick={() => handleContextMenuAction('newFolder', contextMenu.node)}
              />
              <ContextMenuItem
                icon="file/uploadFile"
                label={t('skill:editor_upload')}
                onClick={() => handleContextMenuAction('upload', contextMenu.node)}
              />
            </>
          ) : (
            <>
              <ContextMenuItem
                icon="edit"
                label={t('skill:editor_rename')}
                onClick={() => handleContextMenuAction('rename', contextMenu.node)}
              />
              <ContextMenuItem
                icon="delete"
                label={t('skill:editor_delete')}
                color="red.500"
                onClick={() => handleContextMenuAction('delete', contextMenu.node)}
              />
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

type ContextMenuItemProps = {
  icon: string;
  label: string;
  onClick: () => void;
  color?: string;
};

const ContextMenuItem = ({ icon, label, onClick, color }: ContextMenuItemProps) => (
  <Flex
    px={3}
    py={1.5}
    align="center"
    cursor="pointer"
    fontSize="sm"
    color={color || 'myGray.600'}
    _hover={{ bg: 'myGray.50', color: 'primary.600' }}
    onClick={onClick}
  >
    <MyIcon name={icon as any} w="14px" mr={2} />
    <Text>{label}</Text>
  </Flex>
);

export default FileTree;
