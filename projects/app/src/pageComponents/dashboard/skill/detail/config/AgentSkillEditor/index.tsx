import React, { useEffect, useRef } from 'react';
import { Flex, Center, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { EditorInstance } from './types';

import FileTree from './components/FileTree';
import FileTabs from './components/FileTabs';
import EditorContent from './components/EditorContent';
import { useFileTree } from './hooks/useFileTree';
import { useFileOperations } from './hooks/useFileOperations';
import { useAutoSave } from './hooks/useAutoSave';

export type Props = {
  skillId: string;
  canWrite: boolean;
};

const AgentSkillEditor = ({ skillId, canWrite }: Props) => {
  const { t } = useTranslation();
  const editorRef = useRef<EditorInstance>();
  const isUpdatingRef = useRef(false);

  const tree = useFileTree({ skillId });
  const {
    scheduleAutoSave,
    flushPendingForPath,
    cancelPendingForPath,
    closeFile: closeFileFlush,
    setOpenedFilesRef
  } = useAutoSave({ skillId });
  const ops = useFileOperations({
    skillId,
    closeFileFlush,
    flushPendingForPath,
    cancelPendingForPath,
    refreshDir: tree.refreshDir
  });

  // Keep useAutoSave's openedFilesRef in sync with useFileOperations' openedFiles
  useEffect(() => {
    setOpenedFilesRef(ops.openedFiles);
  }, [ops.openedFiles, setOpenedFilesRef]);

  // Sync Monaco editor value when switching active tab
  useEffect(() => {
    if (!editorRef.current || !ops.activeFilePath || !ops.activeFile) return;
    if (ops.activeFile.isBinary || ops.activeFile.isUnknown) return;
    isUpdatingRef.current = true;
    editorRef.current.setValue(ops.activeFile.content);
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  }, [ops.activeFilePath]);

  return (
    <Flex h="full" w="full" direction="column">
      <MyBox
        isLoading={tree.loadingRoot && tree.fileTree.length === 0}
        display={'flex'}
        flex={1}
        minH={0}
        w="full"
        bg="myGray.25"
        borderRadius="12px"
        overflow="hidden"
        border="1px solid"
        borderColor="myGray.200"
      >
        {tree.fileTree.length === 0 && !tree.loadingRoot ? (
          <Center h="full" w="full">
            <VStack spacing={3}>
              <EmptyTip text={t('skill:editor_no_file')} mt={0} />
            </VStack>
          </Center>
        ) : (
          <>
            <FileTree
              filteredTree={tree.filteredTree}
              searchQuery={tree.searchQuery}
              setSearchQuery={tree.setSearchQuery}
              expandedDirs={tree.expandedDirs}
              loadingDirs={tree.loadingDirs}
              activeFilePath={ops.activeFilePath}
              openFile={ops.openFile}
              toggleDirectory={tree.toggleDirectory}
              canWrite={canWrite}
              onCreateFile={ops.handleCreateFile}
              onCreateFolder={ops.handleCreateFolder}
              onUploadFiles={ops.handleUploadFiles}
              onRename={ops.handleRename}
              onDelete={ops.handleDelete}
            />
            <MyBox
              isLoading={ops.loadingFile}
              display={'flex'}
              flex={1}
              w={0}
              minH={0}
              flexDirection="column"
              bg="myGray.25"
            >
              {ops.openedFiles.length > 0 ? (
                <>
                  <FileTabs
                    openedFiles={ops.openedFiles}
                    activeFilePath={ops.activeFilePath}
                    setActiveFilePath={ops.setActiveFilePath}
                    closeFile={ops.closeFile}
                  />
                  <EditorContent
                    activeFile={ops.activeFile}
                    activeFilePath={ops.activeFilePath}
                    setOpenedFiles={ops.setOpenedFiles}
                    editorRef={editorRef}
                    isUpdatingRef={isUpdatingRef}
                    canWrite={canWrite}
                    scheduleAutoSave={scheduleAutoSave}
                  />
                </>
              ) : (
                tree.filteredTree.length > 0 && (
                  <Center h="full">
                    <VStack spacing={3}>
                      <EmptyTip text={t('skill:editor_select_file_edit')} mt={0} />
                    </VStack>
                  </Center>
                )
              )}
            </MyBox>
          </>
        )}
      </MyBox>
      <ops.DeleteConfirmModal />
      <ops.NameInputModal />
    </Flex>
  );
};

export default AgentSkillEditor;
