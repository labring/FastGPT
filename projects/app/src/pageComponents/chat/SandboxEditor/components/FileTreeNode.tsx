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
  const isActive = node.type === 'file' && activeFilePath === node.path;
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

  return (
    <Box>
      <Flex
        ref={(el) => {
          setDragRef(el);
          setDropRef(el);
        }}
        pl={`${node.level * 16 + 4}px`}
        pr={2}
        h="28px"
        cursor="pointer"
        opacity={isDragging ? 0.4 : 1}
        _hover={{ bg: 'myGray.05' }}
        bg={
          isOverNode
            ? 'rgba(56, 139, 253, 0.08)'
            : isSelected
              ? 'primary.100'
              : isActive
                ? 'myGray.05'
                : 'transparent'
        }
        border={isOverNode ? '1px dashed #2B5FD9' : '1px solid transparent'}
        borderRadius="xs"
        onClick={() => {
          if (!node || !node.path) return;
          if (node.type === 'file') {
            setSelectedPath(node.path);
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
        color="myGray.600"
        transition="all 0.15s ease"
        userSelect={'none'}
        {...listeners}
        {...attributes}
      >
        {/* 左侧展开折叠三角形 */}
        <Flex
          justify="center"
          align="center"
          w="16px"
          h="16px"
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
              <Spinner size="xs" color="myGray.400" />
            ) : (
              <MyIcon
                name="core/chat/chevronRight"
                w="16px"
                h="16px"
                transition="transform 0.15s ease"
                transform={isExpanded ? 'rotate(90deg)' : 'none'}
                color="myGray.600"
              />
            ))}
        </Flex>

        {/* 匹配图标 */}
        {node.type === 'directory' ? (
          <MyIcon
            name="common/folderFill"
            w="16px"
            h="16px"
            color="#EF7623"
            mr="8px"
            flexShrink={0}
          />
        ) : (
          <MyIcon
            name={getIconByFilename(node.name)}
            fill="none"
            w="16px"
            h="16px"
            color="myGray.600"
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
            fontWeight={isSelected || isActive ? 'medium' : '400'}
          >
            {node.name}
          </Text>
        )}
      </Flex>

      {/* 渲染子节点，同时在需要时渲染 Inline 新建子节点输入框 */}
      {shouldShowArrow && isExpanded && (
        <Box>
          {node.children && <>{renderTreeNodes(node.children)}</>}
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
  const finishedRef = useRef(false);

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
    if (finishedRef.current) return;
    finishedRef.current = true;
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
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (finishedRef.current) return;
          finishedRef.current = true;
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
  const finishedRef = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  const handleSubmit = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const trimmed = val.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Flex
      pl={`${level * 16 + 4}px`}
      pr={2}
      h="28px"
      align="center"
      fontSize="13px"
      bg="transparent"
      border="1px solid transparent"
      borderRadius="6px"
    >
      <Flex justify="center" align="center" w="16px" h="16px" flexShrink={0} />
      {type === 'directory' ? (
        <MyIcon
          name="core/app/sandbox/folderLine"
          w="16px"
          h="16px"
          color="#64748B"
          mr="8px"
          flexShrink={0}
        />
      ) : (
        <MyIcon
          name="core/app/sandbox/fileGenericLine"
          fill="none"
          w="16px"
          h="16px"
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
            e.preventDefault();
            handleSubmit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            if (finishedRef.current) return;
            finishedRef.current = true;
            onCancel();
          }
        }}
        userSelect={'text'}
      />
    </Flex>
  );
};

export default FileTreeNode;
