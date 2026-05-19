import type React from 'react';
import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { useDisclosure } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useLatest } from 'ahooks';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { OpenedFile } from '../components/FileTabs';
import type { TreeNode } from '../components/FileTree';
import { getLanguageByFileName, getIsBinaryByLanguage } from '../utils';
import {
  getSkillPackageFile,
  writeSkillPackageFile,
  deleteSkillPackageEntry,
  renameSkillPackageEntry,
  mkdirSkillPackageEntry,
  uploadSkillPackageFile
} from '../api';

type UseFileOperationsParams = {
  skillId: string;
  closeFileFlush: (filePath: string) => void;
  flushPendingForPath: (prefix: string) => Promise<void>;
  cancelPendingForPath: (prefix: string) => void;
  refreshDir: (dirPath: string) => Promise<void>;
};

export const useFileOperations = ({
  skillId,
  closeFileFlush,
  flushPendingForPath,
  cancelPendingForPath,
  refreshDir
}: UseFileOperationsParams) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');

  const activeFile = useMemoEnhance(() => {
    return openedFiles.find((f) => f.path === activeFilePath);
  }, [openedFiles, activeFilePath]);

  const openedFilesRef = useLatest(openedFiles);

  // Name-input modal state exposed for inline rendering
  const nameModalState = useRef<{ title: string; defaultValue?: string }>({ title: '' });
  const nameResolveRef = useRef<((value: string | null) => void) | null>(null);
  const [nameInputValue, setNameInputValue] = useState('');
  const {
    isOpen: isNameModalOpen,
    onOpen: onNameModalOpen,
    onClose: onNameModalClose
  } = useDisclosure();

  const requestName = useCallback(
    (params: { title: string; defaultValue?: string }): Promise<string | null> => {
      return new Promise((resolve) => {
        nameResolveRef.current = resolve;
        nameModalState.current = params;
        setNameInputValue(params.defaultValue || '');
        onNameModalOpen();
      });
    },
    [onNameModalOpen]
  );

  const handleNameConfirm = useCallback(() => {
    nameResolveRef.current?.(nameInputValue.trim() || null);
    nameResolveRef.current = null;
    onNameModalClose();
  }, [nameInputValue, onNameModalClose]);

  const handleNameCancel = useCallback(() => {
    nameResolveRef.current?.(null);
    nameResolveRef.current = null;
    onNameModalClose();
  }, [onNameModalClose]);

  const { runAsync: loadFile, loading: loadingFile } = useRequest(
    async (
      filePath: string,
      language: string
    ): Promise<{ content: string; isUnknown: boolean }> => {
      const response = await getSkillPackageFile({ skillId, path: filePath });
      const isBinary = getIsBinaryByLanguage(language);
      if (isBinary) {
        const blob = await response.blob();
        return { content: URL.createObjectURL(blob), isUnknown: false };
      }
      const buffer = await response.arrayBuffer();
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        return { content, isUnknown: false };
      } catch {
        return { content: '', isUnknown: true };
      }
    },
    { manual: true }
  );

  const openFile = useCallback(
    async (filePath: string) => {
      const existing = openedFiles.find((f) => f.path === filePath);
      if (existing) {
        setActiveFilePath(filePath);
        return;
      }
      try {
        const fileName = filePath.split('/').pop() || '';
        const language = getLanguageByFileName(fileName);
        const isBinary = getIsBinaryByLanguage(language);
        const { content, isUnknown } = await loadFile(filePath, language);
        const newFile: OpenedFile = {
          path: filePath,
          name: fileName,
          content,
          language,
          isBinary,
          isUnknown
        };
        setOpenedFiles((prev) => [...prev, newFile]);
        setActiveFilePath(filePath);
      } catch (err) {
        toast({
          status: 'error',
          title: t('skill:editor_open_failed'),
          description: getErrText(err)
        });
      }
    },
    [openedFiles, loadFile, t, toast]
  );

  const closeFile = useCallback(
    (filePath: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      closeFileFlush(filePath);
      setOpenedFiles((prev) => {
        const target = prev.find((f) => f.path === filePath);
        if (target?.isBinary && target.content.startsWith('blob:')) {
          URL.revokeObjectURL(target.content);
        }
        const next = prev.filter((f) => f.path !== filePath);
        if (activeFilePath === filePath) {
          setActiveFilePath(next.length > 0 ? next[next.length - 1].path : '');
        }
        return next;
      });
    },
    [closeFileFlush, activeFilePath]
  );

  const handleCreateFile = useCallback(
    async (parentDir: string) => {
      const name = await requestName({ title: t('skill:editor_prompt_new_file_name') });
      if (!name) return;
      const fullPath = parentDir ? `${parentDir}/${name}` : name;
      try {
        await writeSkillPackageFile({ skillId, path: fullPath, content: '' });
        await refreshDir(parentDir);
        openFile(fullPath);
      } catch (err) {
        toast({
          status: 'error',
          title: t('skill:editor_create_failed'),
          description: getErrText(err)
        });
      }
    },
    [skillId, requestName, t, toast, refreshDir, openFile]
  );

  const handleCreateFolder = useCallback(
    async (parentDir: string) => {
      const name = await requestName({ title: t('skill:editor_prompt_new_folder_name') });
      if (!name) return;
      const fullPath = parentDir ? `${parentDir}/${name}` : name;
      try {
        await mkdirSkillPackageEntry({ skillId, path: fullPath });
        await refreshDir(parentDir);
      } catch (err) {
        toast({
          status: 'error',
          title: t('skill:editor_create_failed'),
          description: getErrText(err)
        });
      }
    },
    [skillId, requestName, t, toast, refreshDir]
  );

  const handleUploadFiles = useCallback(
    async (parentDir: string, files: File[]) => {
      try {
        for (const file of files) {
          const fullPath = parentDir ? `${parentDir}/${file.name}` : file.name;
          await uploadSkillPackageFile({ skillId, path: fullPath, file });
        }
        toast({ status: 'success', title: t('skill:editor_upload_success') });
        await refreshDir(parentDir);
      } catch (err) {
        toast({
          status: 'error',
          title: t('skill:editor_upload_failed'),
          description: getErrText(err)
        });
      }
    },
    [skillId, t, toast, refreshDir]
  );

  const handleRename = useCallback(
    async (node: TreeNode) => {
      const newName = await requestName({
        title: t('skill:editor_prompt_rename'),
        defaultValue: node.name
      });
      if (!newName || newName === node.name) return;
      const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
      const toPath = parent ? `${parent}/${newName}` : newName;

      await flushPendingForPath(node.path);

      try {
        await renameSkillPackageEntry({ skillId, fromPath: node.path, toPath });
        setOpenedFiles((prev) =>
          prev.filter((f) => f.path !== node.path && !f.path.startsWith(node.path + '/'))
        );
        if (activeFilePath === node.path || activeFilePath.startsWith(node.path + '/')) {
          setActiveFilePath('');
        }
        await refreshDir(parent);
      } catch (err) {
        toast({
          status: 'error',
          title: t('skill:editor_rename_failed'),
          description: getErrText(err)
        });
      }
    },
    [skillId, requestName, t, toast, flushPendingForPath, refreshDir, activeFilePath]
  );

  const { openConfirm: openConfirmDelete, ConfirmModal: DeleteConfirmModal } = useConfirm({
    title: t('skill:editor_confirm_delete_title'),
    content: t('skill:editor_confirm_delete_content')
  });

  const handleDelete = useCallback(
    (node: TreeNode) => {
      openConfirmDelete({
        onConfirm: async () => {
          cancelPendingForPath(node.path);
          try {
            await deleteSkillPackageEntry({
              skillId,
              path: node.path,
              recursive: node.type === 'directory'
            });
            setOpenedFiles((prev) =>
              prev.filter((f) => f.path !== node.path && !f.path.startsWith(node.path + '/'))
            );
            if (activeFilePath === node.path || activeFilePath.startsWith(node.path + '/')) {
              setActiveFilePath('');
            }
            const parent = node.path.includes('/')
              ? node.path.slice(0, node.path.lastIndexOf('/'))
              : '';
            await refreshDir(parent);
          } catch (err) {
            toast({
              status: 'error',
              title: t('skill:editor_delete_failed'),
              description: getErrText(err)
            });
          }
        }
      })();
    },
    [skillId, t, toast, cancelPendingForPath, refreshDir, activeFilePath, openConfirmDelete]
  );

  return {
    openedFiles,
    setOpenedFiles,
    activeFilePath,
    setActiveFilePath,
    activeFile,
    openedFilesRef,
    openFile,
    closeFile,
    loadingFile,
    handleCreateFile,
    handleCreateFolder,
    handleUploadFiles,
    handleRename,
    handleDelete,
    DeleteConfirmModal,
    nameModalState,
    nameInputValue,
    setNameInputValue,
    isNameModalOpen,
    handleNameConfirm,
    handleNameCancel
  };
};
