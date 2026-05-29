import React, { useEffect, useRef, useState } from 'react';
import {
  Flex,
  Center,
  HStack,
  VStack,
  ModalBody,
  ModalFooter,
  Input,
  FormControl,
  Button,
  Box,
  Text
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
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
  const [isFileTreeVisible, setIsFileTreeVisible] = useState(true);

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

  // Seed packageVersionRef with current version on mount, so the polling below
  // does not falsely detect a change when the initial ref value (0) differs from
  // the stored version.
  useEffect(() => {
    if (!skillId) return;
    checkSkillPackageVersion({ skillId, knownVersion: 0 })
      .then((result) => {
        packageVersionRef.current = result.currentVersion;
      })
      .catch(() => {});
  }, [skillId, packageVersionRef]);

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
    refreshDir: tree.refreshDir,
    packageVersionRef
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
    <>
      {staleDetected && (
        <HStack
          px={4}
          py={2}
          mb={2}
          bg={'yellow.25'}
          borderRadius={'md'}
          spacing={2}
          align={'center'}
          justify={'space-between'}
          flexShrink={0}
        >
          <HStack spacing={2} align={'center'}>
            <MyIcon
              name={'common/info' as any}
              w={'16px'}
              flexShrink={0}
              color={'yellow.700'}
              mt={'1px'}
            />
            <Box fontSize={'12px'} color={'yellow.700'}>
              {t('skill:editor_stale_detected')}
            </Box>
          </HStack>
          <Button
            size="xs"
            variant="outline"
            colorScheme="yellow"
            onClick={async () => {
              setStaleDetected(false);
              try {
                const result = await checkSkillPackageVersion({ skillId, knownVersion: 0 });
                packageVersionRef.current = result.currentVersion;
              } catch {}
              await tree.reloadRoot();
              ops.refreshOpenedFiles();
            }}
          >
            {t('common:refresh')}
          </Button>
        </HStack>
      )}
      <Box
        flex={1}
        minH={0}
        bg={'white'}
        borderRadius={'8px'}
        border={'1px solid #EBEDF0'}
        overflow={'hidden'}
        display="flex"
        flexDirection="column"
      >
        <MyBox
          isLoading={tree.loadingRoot && tree.fileTree.length === 0}
          display={'flex'}
          flex={1}
          minH={0}
          w="full"
          overflow="hidden"
        >
          {tree.fileTree.length === 0 && !tree.loadingRoot ? (
            <Center h="full" w="full">
              <VStack spacing={3}>
                <EmptyTip text={t('skill:editor_no_file')} mt={0} />
              </VStack>
            </Center>
          ) : (
            <>
              <Box
                position="relative"
                display="flex"
                flex={isFileTreeVisible ? '0 0 270px' : '0 0 0px'}
                flexShrink={0}
                overflow="visible"
                minH={0}
              >
                {isFileTreeVisible && (
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
                )}
                <Center
                  position="absolute"
                  top="50%"
                  right="-16px"
                  transform="translateY(-50%)"
                  w="16px"
                  h="48px"
                  bg="#F0F2F5"
                  borderTopRightRadius="6px"
                  borderBottomRightRadius="6px"
                  cursor="pointer"
                  zIndex={2}
                  onClick={() => setIsFileTreeVisible((v) => !v)}
                >
                  <MyIcon
                    name={'core/chat/chevronRight' as any}
                    w="16px"
                    h="16px"
                    color="#485264"
                    transform={isFileTreeVisible ? 'rotate(180deg)' : undefined}
                    transition="transform 0.2s"
                  />
                </Center>
              </Box>
              <MyBox
                isLoading={ops.loadingFile}
                display={'flex'}
                flex={1}
                w={0}
                minH={0}
                flexDirection="column"
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
      </Box>
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
    </>
  );
};

export default AgentSkillEditor;
