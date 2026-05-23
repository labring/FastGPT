import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Center, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SkillDetailContext } from '../../dashboard/skill/detail/context';
import { useContextSelector } from 'use-context-selector';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type Editor from '@monaco-editor/react';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

import FileTree from './components/FileTree';
import FileTabs from './components/FileTabs';
import EditorContent from './components/EditorContent';
import { filterTree } from './utils';
import { useSandboxFileStore } from './hook';

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0];

const FILE_TREE_DEFAULT_WIDTH = 230;
const FILE_TREE_MIN_WIDTH = 230;
const FILE_TREE_MAX_WIDTH = 600;
const EDITOR_MIN_WIDTH = 360;

export type Props = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  showFileOps?: boolean;
  showDownload?: boolean;
  defaultViewMode?: 'source' | 'preview';
  isPreparing?: boolean;
  preparingText?: string;
};

const SandboxEditor = ({
  appId,
  chatId,
  outLinkAuthData,
  showFileOps = true,
  showDownload = true,
  defaultViewMode,
  isPreparing = false,
  preparingText
}: Props) => {
  const { t } = useTranslation();
  const saveAllRef = useContextSelector(SkillDetailContext, (v) => v.saveAllRef);
  const editorRef = useRef<EditorInstance>();
  const editorLayoutRef = useRef<HTMLDivElement>(null);
  const [fileTreeWidth, setFileTreeWidth] = useState(FILE_TREE_DEFAULT_WIDTH);
  const [isFileTreeResizing, setIsFileTreeResizing] = useState(false);
  const {
    fileTree,
    openedFiles,
    setOpenedFiles,
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
  } = useSandboxFileStore({
    appId,
    chatId,
    outLinkAuthData
  });

  // 绑定全部保存方法到 Context 引用上
  useEffect(() => {
    const currentSaveAllRef = saveAllRef;
    if (currentSaveAllRef) {
      currentSaveAllRef.current = saveAllFiles;
    }
    return () => {
      if (currentSaveAllRef) {
        currentSaveAllRef.current = undefined;
      }
    };
  }, [saveAllFiles, saveAllRef]);

  const loadWorkspace = useCallback(() => {
    if (isPreparing) return;
    refreshWorkspace();
  }, [isPreparing, refreshWorkspace]);

  // 初始化加载根目录；Skill edit 等 sandbox ready 后再开始拉取文件列表。
  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const filteredTree = filterTree(fileTree, searchQuery);

  const handleFileTreeResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = fileTreeWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      setIsFileTreeResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (event: MouseEvent) => {
        const containerWidth = editorLayoutRef.current?.getBoundingClientRect().width ?? 0;
        const maxWidth =
          containerWidth > 0
            ? Math.min(
                FILE_TREE_MAX_WIDTH,
                Math.max(FILE_TREE_MIN_WIDTH, containerWidth - EDITOR_MIN_WIDTH)
              )
            : FILE_TREE_MAX_WIDTH;

        setFileTreeWidth(
          Math.min(Math.max(startWidth + event.clientX - startX, FILE_TREE_MIN_WIDTH), maxWidth)
        );
      };

      const handleMouseUp = () => {
        setIsFileTreeResizing(false);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [fileTreeWidth]
  );

  const renderContent = () => {
    if (fileTree.length === 0) {
      if (loadingRoot) return null;

      return (
        <Center h="full" w={'full'}>
          <VStack spacing={3}>
            <EmptyTip text={t('chat:sandbox_no_file')} mt={0} />
          </VStack>
        </Center>
      );
    }

    return (
      <>
        <FileTree
          width={fileTreeWidth}
          filteredTree={filteredTree}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          expandedDirs={expandedDirs}
          loadingDirs={loadingDirs}
          activeFilePath={activeFilePath}
          selectedPath={selectedPath}
          setSelectedPath={setSelectedPath}
          openFile={openFile}
          toggleDirectory={toggleDirectory}
          onCreateNode={onCreateNode}
          onRenameComplete={onRenameComplete}
          onMoveFile={onMoveFile}
          onDeleteFile={onDeleteFile}
          onUploadFiles={onUploadFiles}
          setExpandedDirs={setExpandedDirs}
          appId={appId}
          chatId={chatId}
          outLinkAuthData={outLinkAuthData}
          showFileOps={showFileOps}
        />

        <Box
          role="separator"
          aria-label="Resize file tree"
          aria-orientation="vertical"
          flex="0 0 8px"
          w="8px"
          h="full"
          ml="-4px"
          mr="-4px"
          cursor="col-resize"
          position="relative"
          zIndex={3}
          onMouseDown={handleFileTreeResizeStart}
          _before={{
            content: '""',
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            w: '1px',
            bg: isFileTreeResizing ? 'primary.600' : 'myGray.200',
            transition: 'background 0.15s'
          }}
          _hover={{
            _before: {
              bg: 'primary.600'
            }
          }}
        />

        {/* 右侧: 编辑器区域 */}
        <MyBox
          isLoading={loadingFile}
          loadingVariant="particle"
          display={'flex'}
          flex={1}
          w={0}
          minH={0}
          flexDirection="column"
          bg="myGray.25"
        >
          {openedFiles.length > 0 ? (
            <>
              <FileTabs
                openedFiles={openedFiles}
                activeFilePath={activeFilePath}
                setActiveFilePath={setActiveFilePath}
                closeFile={closeFile}
              />
              <EditorContent
                activeFile={activeFile}
                activeFilePath={activeFilePath}
                saving={saving}
                downloadingFile={downloadingFile}
                downloadCurrentFile={downloadCurrentFile}
                saveFile={saveFile}
                setOpenedFiles={setOpenedFiles}
                openedFiles={openedFiles}
                editorRef={editorRef}
                appId={appId}
                chatId={chatId}
                outLinkAuthData={outLinkAuthData}
                showDownload={showDownload}
                defaultViewMode={defaultViewMode}
              />
            </>
          ) : (
            filteredTree.length > 0 && (
              <Center h="full">
                <VStack spacing={3}>
                  <EmptyTip text={t('chat:sandbox_select_file_edit')} mt={0} />
                </VStack>
              </Center>
            )
          )}
        </MyBox>
      </>
    );
  };

  return (
    <MyBox
      isLoading={isPreparing || (loadingRoot && fileTree.length === 0)}
      text={isPreparing ? preparingText : t('chat:sandbox_loading_files')}
      loadingVariant="particle"
      ref={editorLayoutRef}
      display={'flex'}
      h="full"
      w="full"
      bg="myGray.25"
    >
      {!isPreparing && renderContent()}
    </MyBox>
  );
};

export default SandboxEditor;
