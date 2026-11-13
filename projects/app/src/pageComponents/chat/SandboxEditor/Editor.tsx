import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import { SkillDetailContext } from '../../dashboard/skill/detail/context';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyModal from '@fastgpt/web/components/common/MyModal';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

import FileTree from './components/FileTree';
import EditorWorkspace from './components/EditorWorkspace';
import { filterTree } from './utils';
import { useSandboxFileStore } from './hook';
import type { SandboxEditorInstance, SandboxTargetInput } from './types';
import { resolveSandboxTarget } from './types';

const FILE_TREE_DEFAULT_WIDTH = 260;
const FILE_TREE_MIN_WIDTH = 260;
const FILE_TREE_MAX_WIDTH = 600;
const EDITOR_MIN_WIDTH = 360;

export type Props = {
  appId?: string;
  chatTarget?: SandboxTargetInput['chatTarget'];
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  showFileOps?: boolean;
  showDownload?: boolean;
  showFileTreeDownload?: boolean;
  defaultViewMode?: 'source' | 'preview';
  isPreparing?: boolean;
  showTerminal?: boolean;
  enablePathCopy?: boolean;
  enableZipExtract?: boolean;
  enableMultiSelect?: boolean;
  onError?: (err: Error) => void;
  headerRight?: React.ReactNode;
  bg?: string;
};

const SandboxEditor = ({
  appId,
  chatTarget,
  chatId,
  outLinkAuthData,
  showFileOps = true,
  showDownload = true,
  showFileTreeDownload,
  defaultViewMode,
  isPreparing = false,
  showTerminal = false,
  enablePathCopy = false,
  enableZipExtract = false,
  enableMultiSelect = false,
  onError,
  headerRight,
  bg
}: Props) => {
  const { t } = useTranslation();
  const saveAllRef = useContextSelector(SkillDetailContext, (v) => v.saveAllRef);
  const editorRef = useRef<SandboxEditorInstance>();
  const editorLayoutRef = useRef<HTMLDivElement>(null);
  const [fileTreeWidth, setFileTreeWidth] = useState(FILE_TREE_DEFAULT_WIDTH);
  const [isFileTreeResizing, setIsFileTreeResizing] = useState(false);
  const chatTargetAppId = chatTarget?.appId;
  const chatTargetSkillId = chatTarget?.skillId;
  const chatTargetSourceType =
    chatTarget && 'sourceType' in chatTarget ? chatTarget.sourceType : undefined;
  const sandboxTarget = useMemo(
    () =>
      resolveSandboxTarget({
        appId,
        chatTarget: chatTargetSkillId
          ? { skillId: chatTargetSkillId }
          : chatTargetAppId
            ? {
                appId: chatTargetAppId,
                ...(chatTargetSourceType ? { sourceType: chatTargetSourceType } : {})
              }
            : undefined
      }),
    [appId, chatTargetAppId, chatTargetSkillId, chatTargetSourceType]
  );
  const fileTreeShowDownload = showFileTreeDownload ?? showDownload;

  const {
    fileTree,
    sessionWorkDirectory,
    isWorkspaceLoaded,
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
    onMoveFiles,
    onDeleteFile,
    onUploadFiles,
    onExecCommand,
    toggleDirectory
  } = useSandboxFileStore({
    sandboxTarget,
    chatId,
    outLinkAuthData,
    isPreparing,
    canWrite: showFileOps,
    onError
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
    const isInitialLoading =
      isPreparing || ((!isWorkspaceLoaded || loadingRoot) && fileTree.length === 0);

    const fileTreeComponent = (
      <FileTree
        sessionWorkDirectory={sessionWorkDirectory}
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
        onMoveFiles={onMoveFiles}
        onDeleteFile={onDeleteFile}
        onUploadFiles={onUploadFiles}
        onExecCommand={onExecCommand}
        onRefreshWorkspace={refreshWorkspace}
        setExpandedDirs={setExpandedDirs}
        sandboxTarget={sandboxTarget}
        chatId={chatId}
        outLinkAuthData={outLinkAuthData}
        showFileOps={showFileOps}
        showDownload={fileTreeShowDownload}
        enablePathCopy={enablePathCopy}
        enableZipExtract={enableZipExtract}
        enableMultiSelect={enableMultiSelect}
        isLoading={isInitialLoading}
      />
    );

    const resizeSeparatorComponent = (
      <Box
        role="separator"
        aria-label="Resize file tree"
        aria-orientation="vertical"
        flex="none"
        w={'8px'}
        h="full"
        ml="0"
        mr="0"
        cursor="col-resize"
        position="absolute"
        left={`${fileTreeWidth + 4}px`}
        transform="translateX(-50%)"
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
          bg: isFileTreeResizing ? 'primary.600' : 'transparent',
          transition: 'background 0.15s'
        }}
        _hover={{
          _before: {
            bg: 'primary.600'
          }
        }}
      />
    );

    const workspaceComponent = (
      <EditorWorkspace
        sandboxTarget={sandboxTarget}
        chatId={chatId}
        outLinkAuthData={outLinkAuthData}
        showDownload={showDownload}
        defaultViewMode={defaultViewMode}
        openedFiles={openedFiles}
        setOpenedFiles={setOpenedFiles}
        activeFilePath={activeFilePath}
        setActiveFilePath={setActiveFilePath}
        closeFile={closeFile}
        activeFile={activeFile}
        downloadingFile={downloadingFile}
        downloadCurrentFile={downloadCurrentFile}
        saveFile={saveFile}
        editorRef={editorRef}
        filteredTree={filteredTree}
        showTerminalBtn={showTerminal}
        canWrite={showFileOps}
        headerRight={headerRight}
        isPreparing={isPreparing}
        isWorkspaceLoaded={isWorkspaceLoaded}
        loadingRoot={loadingRoot}
        hasFiles={fileTree.length > 0}
      />
    );

    return (
      <Flex w="100%" h="100%" position="relative">
        {/* 左侧：文件配置卡片 */}
        <Box
          w={`${fileTreeWidth}px`}
          flexShrink={0}
          h="100%"
          bg="white"
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="lg"
          overflow="hidden"
          display="flex"
          flexDirection="column"
          p={3}
          mr={'8px'}
        >
          {fileTreeComponent}
        </Box>

        {resizeSeparatorComponent}

        {/* 右侧：工作区卡片及上方页签行 */}
        <Box flex={1} w={0} h="100%" display="flex" flexDirection="column">
          {workspaceComponent}
        </Box>
      </Flex>
    );
  };

  return (
    <>
      <MyBox
        ref={editorLayoutRef}
        onFocusCapture={onWorkspaceFocus}
        display={'flex'}
        h="full"
        w="full"
        bg={bg ?? 'myGray.25'}
      >
        {renderContent()}
      </MyBox>
      {conflictFilePath && (
        <MyModal
          isOpen
          isCentered
          onClose={isResolvingConflict ? undefined : onCloseConflictModal}
          title={t('chat:sandbox_save_conflict_title')}
          maxW={['90vw', '480px']}
          closeOnOverlayClick={!isResolvingConflict}
        >
          <ModalBody py={4} fontSize={'sm'} color={'myGray.700'} wordBreak={'break-word'}>
            {t('chat:sandbox_save_conflict_desc', { path: conflictFilePath })}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              variant={'whiteBase'}
              size={'sm'}
              isDisabled={isResolvingConflict}
              onClick={() => void onReloadConflictFile()}
            >
              {t('chat:sandbox_save_conflict_reload')}
            </Button>
            <Button
              size={'sm'}
              isLoading={isResolvingConflict}
              onClick={() => void onOverwriteConflictFile()}
            >
              {t('chat:sandbox_save_conflict_overwrite')}
            </Button>
          </ModalFooter>
        </MyModal>
      )}
    </>
  );
};

export default SandboxEditor;
