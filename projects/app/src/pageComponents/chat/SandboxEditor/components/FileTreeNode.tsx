import React, { useState, useEffect, useRef } from 'react';
import { Box, Flex, Text, Spinner, Input } from '@chakra-ui/react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import type { TreeNode } from './FileTree';
import { getIconByFilename } from '../utils';

type Props = {
  node: TreeNode;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  activeFilePath: string;
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  realOverDestPath: string | null;
  openFile: (path: string) => void;
  toggleDirectory: (node: TreeNode) => void;
  renamingPath: string | null;
  setRenamingPath: (path: string | null) => void;
  onRenameComplete: (path: string, newName: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  creatingNode: { parentPath: string; type: 'file' | 'directory' } | null;
  renderTreeNodes: (nodes: TreeNode[]) => React.ReactNode;
  onConfirmCreate: (name: string) => void;
  onCancelCreate: () => void;
  showFileOps?: boolean;
};

const FileTreeNode = ({
  node,
  expandedDirs,
  loadingDirs,
  activeFilePath,
  selectedPath,
  setSelectedPath,
  realOverDestPath,
  openFile,
  toggleDirectory,
  renamingPath,
  setRenamingPath,
  onRenameComplete,
  onContextMenu,
  creatingNode,
  renderTreeNodes,
  onConfirmCreate,
  onCancelCreate,
  showFileOps = true
}: Props) => {
  const isExpanded = expandedDirs.has(node.path);
  const isLoading = loadingDirs.has(node.path);
  const isActive = activeFilePath === node.path;
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const shouldShowArrow = node.type === 'directory';

  // dnd-kit hooks
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging
  } = useDraggable({
    id: node.path,
    data: {
      node
    },
    disabled: !showFileOps || isRenaming
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: node.path,
    disabled: !showFileOps || isRenaming
  });

  // 完美VSCode拖放体验：只允许文件夹节点和根目录Box显示放置高亮
  const isOverNode = node.type === 'directory' && (isOver || realOverDestPath === node.path);

  const iconColor = isSelected ? '#1E293B' : isActive ? '#388BFD' : '#64748B';
  const textColor = isSelected ? '#1E293B' : isActive ? '#388BFD' : '#475569';

  return (
    <Box>
      <Flex
        ref={(el) => {
          setDragRef(el);
          setDropRef(el);
        }}
        pl={`${node.level * 16 + 8}px`}
        pr={2}
        h="32px"
        cursor="pointer"
        opacity={isDragging ? 0.4 : 1}
        _hover={{ bg: 'rgba(15, 23, 42, 0.04)' }}
        bg={
          isSelected
            ? 'rgba(56, 139, 253, 0.12)'
            : isActive
              ? 'rgba(56, 139, 253, 0.04)'
              : isOverNode
                ? 'rgba(56, 139, 253, 0.15)'
                : 'transparent'
        }
        border={isOverNode ? '1px dashed #388BFD' : '1px solid transparent'}
        borderRadius="6px"
        onClick={() => {
          setSelectedPath(node.path);
          if (node.type === 'file') {
            openFile(node.path);
          } else {
            toggleDirectory(node);
          }
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          onContextMenu(e, node);
        }}
        align="center"
        fontSize="13px"
        color={textColor}
        transition="all 0.15s ease"
        userSelect={'none'}
        {...listeners}
        {...attributes}
      >
        {/* 左侧展开折叠三角形 */}
        <Flex
          justify="center"
          align="center"
          w="12px"
          h="12px"
          mr="6px"
          flexShrink={0}
          onClick={(e) => {
            if (shouldShowArrow) {
              e.stopPropagation();
              toggleDirectory(node);
            }
          }}
        >
          {shouldShowArrow &&
            (isLoading ? (
              <Spinner size="xs" color="myGray.400" w="8px" h="8px" />
            ) : (
              <MyIcon
                name="core/chat/chevronRight"
                w="12px"
                transition="transform 0.15s ease"
                transform={isExpanded ? 'rotate(90deg)' : 'none'}
                color={iconColor}
              />
            ))}
        </Flex>

        {/* 匹配图标 */}
        {node.type === 'directory' ? (
          <MyIcon
            name="core/app/sandbox/folderLine"
            w="16px"
            color={iconColor}
            mr="8px"
            flexShrink={0}
          />
        ) : (
          <MyIcon
            name={getIconByFilename(node.name)}
            fill="none"
            w="16px"
            h="16px"
            color={iconColor}
            mr="8px"
            flexShrink={0}
          />
        )}

        {isRenaming ? (
          <RenameInput
            initialName={node.name}
            type={node.type}
            onCancel={() => setRenamingPath(null)}
            onConfirm={(newName) => onRenameComplete(node.path, newName)}
          />
        ) : (
          <Text
            flex={1}
            minW={0}
            noOfLines={1}
            overflow="hidden"
            textOverflow="ellipsis"
            fontWeight={isSelected || isActive ? '500' : '400'}
          >
            {node.name}
          </Text>
        )}
      </Flex>

      {/* 渲染子节点，同时在需要时渲染 Inline 新建子节点输入框 */}
      {shouldShowArrow && isExpanded && (
        <Box>
          {node.children && renderTreeNodes(node.children)}
          {creatingNode && creatingNode.parentPath === node.path && (
            <InlineCreateNode
              level={node.level + 1}
              type={creatingNode.type}
              onConfirm={onConfirmCreate}
              onCancel={onCancelCreate}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

const RenameInput = ({
  initialName,
  type,
  onConfirm,
  onCancel
}: {
  initialName: string;
  type: 'file' | 'directory';
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}) => {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;

      input.focus();
      const dotIdx = initialName.lastIndexOf('.');
      if (dotIdx > 0 && type === 'file') {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [initialName, type]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialName) {
      onCancel();
      return;
    }

    onConfirm(trimmed);
  };

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      size="xs"
      h="22px"
      py={0.5}
      px={1.5}
      ml="-7px"
      fontSize="13px"
      bg="white"
      borderColor="myGray.300"
      _focus={{ borderColor: '#388BFD', boxShadow: 'none' }}
      onClick={(e) => e.stopPropagation()}
      onBlur={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      userSelect={'text'}
    />
  );
};

// 内联创建新节点的局部组件
export const InlineCreateNode = ({
  level,
  type,
  onConfirm,
  onCancel
}: {
  level: number;
  type: 'file' | 'directory';
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) => {
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  const handleSubmit = () => {
    const trimmed = val.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Flex
      pl={`${level * 16 + 8}px`}
      pr={2}
      h="32px"
      align="center"
      fontSize="13px"
      bg="transparent"
      border="1px solid transparent"
      borderRadius="6px"
    >
      <Flex justify="center" align="center" w="12px" h="12px" mr="6px" flexShrink={0} />
      {type === 'directory' ? (
        <MyIcon
          name="core/app/sandbox/folderLine"
          w="16px"
          color="#64748B"
          mr="8px"
          flexShrink={0}
        />
      ) : (
        <MyIcon
          name="core/app/sandbox/fileGenericLine"
          fill="none"
          w="16px"
          color="#64748B"
          mr="8px"
          flexShrink={0}
        />
      )}
      <Input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        size="xs"
        h="22px"
        py={0.5}
        px={1.5}
        ml="-7px"
        fontSize="13px"
        bg="white"
        borderColor="myGray.300"
        placeholder={
          type === 'directory'
            ? t('chat:sandbox_new_folder_placeholder')
            : t('chat:sandbox_new_file_placeholder')
        }
        _focus={{ borderColor: '#388BFD', boxShadow: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onBlur={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSubmit();
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
        userSelect={'text'}
      />
    </Flex>
  );
};

export default FileTreeNode;
