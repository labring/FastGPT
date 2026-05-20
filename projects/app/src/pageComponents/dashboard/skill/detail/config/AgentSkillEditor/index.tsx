import React, { useEffect, useRef, useState } from 'react';
import {
  Flex,
  Center,
  VStack,
  ModalBody,
  ModalFooter,
  Input,
  FormControl,
  Button,
  Box,
  Text
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyModal from '@fastgpt/web/components/common/MyModal';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { EditorInstance } from './types';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../../context';

import FileTree from './components/FileTree';
import FileTabs from './components/FileTabs';
import EditorContent from './components/EditorContent';
import { useFileTree } from './hooks/useFileTree';
import { useFileOperations } from './hooks/useFileOperations';
import { useAutoSave } from './hooks/useAutoSave';
import { checkSkillPackageVersion } from './api';

export type Props = {
  skillId: string;
  canWrite: boolean;
};

const AgentSkillEditor = ({ skillId, canWrite }: Props) => {
  const { t } = useTranslation();
  const editorRef = useRef<EditorInstance>();
  const isUpdatingRef = useRef(false);
  const flushAllPendingRef = useContextSelector(SkillDetailContext, (v) => v.flushAllPendingRef);
  const [staleDetected, setStaleDetected] = useState(false);

  const tree = useFileTree({ skillId });
  const {
    scheduleAutoSave,
    flushPendingForPath,
    flushAllPending,
    cancelPendingForPath,
    closeFile: closeFileFlush,
    setOpenedFilesRef,
    packageVersionRef
  } = useAutoSave({ skillId });

  // Expose flushAllPending so the preview tab can flush pending saves before sandbox sync
  flushAllPendingRef.current = flushAllPending;

  // Poll for changes from other replicas/sessions every 30 s
  useEffect(() => {
    if (!skillId) return;

    const poll = async () => {
      try {
        const result = await checkSkillPackageVersion({
          skillId,
          knownVersion: packageVersionRef.current
        });
        if (result.changed) {
          setStaleDetected(true);
        }
      } catch {
        // Polling errors are non-critical — silently skip
      }
    };

    const interval = setInterval(poll, 30_000);

    // Poll on focus as well, to catch changes made while this tab was backgrounded
    const onFocus = () => {
      void poll();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [skillId]);
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
      {staleDetected && (
        <Box px={4} py={2} bg="blue.50" borderBottom="1px solid" borderColor="blue.200">
          <Flex align="center" justify="space-between">
            <Text fontSize="sm" color="blue.700">
              Files were updated by another session. Refresh to see the latest content.
            </Text>
            <Button
              size="xs"
              variant="outline"
              colorScheme="blue"
              onClick={() => {
                setStaleDetected(false);
                tree.reloadRoot();
              }}
            >
              Refresh
            </Button>
          </Flex>
        </Box>
      )}
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
      <MyModal
        isOpen={ops.isNameModalOpen}
        onClose={ops.handleNameCancel}
        title={ops.nameModalState.current.title}
        maxW={['90vw', '400px']}
      >
        <ModalBody pt={5}>
          <FormControl>
            <Input
              value={ops.nameInputValue}
              autoFocus
              onChange={(e) => ops.setNameInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ops.handleNameConfirm();
              }}
              placeholder={ops.nameModalState.current.defaultValue || ''}
            />
          </FormControl>
        </ModalBody>
        <ModalFooter>
          <Button size={'sm'} variant={'whiteBase'} onClick={ops.handleNameCancel} px={5}>
            {t('common:Cancel')}
          </Button>
          <Button size={'sm'} variant={'primary'} ml={3} onClick={ops.handleNameConfirm} px={5}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Flex>
  );
};

export default AgentSkillEditor;
