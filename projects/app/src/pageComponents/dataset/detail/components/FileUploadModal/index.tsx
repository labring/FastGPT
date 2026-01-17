import React, { useCallback, useEffect, useState } from 'react';
import { VStack, HStack, Button, ModalBody, ModalFooter, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useFileUpload, FileStatus } from './useFileUpload';
import FileList from './FileList';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FileSelector, { type SelectFileItemType } from '../FileSelector';
import { Trans } from 'next-i18next';
import { fileDownload } from '@/web/common/file/utils';
import { postCheckDuplicateCollection } from '@/web/core/dataset/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import DuplicateConfirmModal from '../../RefinedCollectionCard/DuplicateConfirmModal';

export interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;

  // 文件限制配置（传递给 FileSelector）
  maxFiles?: number; // 最大文件数量，默认 10
  maxFileSize?: number;
  acceptedTypes?: string[]; // 允许的文件类型，默认 ['.xlsx', '.xls', '.csv']

  // 上传配置
  concurrency?: number; // 并发上传数量，默认 1
  uploadApi: (file: File, onProgress?: (progress: number) => void) => Promise<any>; // 上传 API 函数

  // 国际化
  title?: string;
  confirmText?: string;
  cancelText?: string;

  // 数据集ID（用于重名检测）
  datasetId: string;
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  maxFiles = 10,
  acceptedTypes = ['.xlsx', '.xls', '.csv'],
  concurrency = 1,
  uploadApi,
  title,
  confirmText,
  maxFileSize,
  cancelText,
  datasetId
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // 重名检测状态
  const [duplicateFiles, setDuplicateFiles] = useState<string[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // 文件上传 hook
  const {
    uploadQueue,
    isUploading,
    completedCount,
    totalCount,
    startUpload,
    addFiles,
    removeFile,
    retryFailedFiles,
    getUploadStats,
    clearQueue
  } = useFileUpload({
    concurrency,
    uploadApi
  });

  // 文件名校验函数
  const fileNameValidator = useCallback((fileName: string) => {
    const reg = /^[a-zA-Z_\u4e00-\u9fff][a-zA-Z0-9_\u4e00-\u9fff]*$/;
    return reg.test(fileName);
  }, []);

  // FileSelector 状态
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);

  const handleDownloadTemplate = () => {
    const content = `id,name,age,region
1, 'Alice', 30, 'US'
2, 'Bob', 25, 'UK'
3, 'Charlie', 35 ,'US'
4, 'Diana', 28, 'CN'`;
    fileDownload({
      text: content,
      type: 'text/csv;charset=utf-8',
      filename: 'file_template.csv'
    });
  };

  // 处理 FileSelector 的文件选择
  const handleFileSelectorChange = useCallback(
    (files: SelectFileItemType[]) => {
      setSelectFiles(files);

      // 找出新增的文件（不在之前 selectFiles 中的文件）
      const newFiles = files.filter(
        (newFile) => !selectFiles.some((existingFile) => existingFile.name === newFile.name)
      );

      // 只添加新增的文件到上传队列
      if (newFiles.length > 0) {
        const fileObjects = newFiles.map((item) => item.file);
        const icons = newFiles.map((item) => item.icon);
        addFiles(fileObjects, icons);
      }
    },
    [addFiles, selectFiles]
  );

  // 处理删除文件，同时更新 FileSelector 状态
  const handleRemoveFile = useCallback(
    (id: string) => {
      // 先找到要删除的文件信息
      const removedFile = uploadQueue.find((item) => item.id === id);

      // 从上传队列中移除文件
      removeFile(id);

      // 同时从 FileSelector 状态中移除对应的文件
      if (removedFile) {
        setSelectFiles((prev) =>
          prev.filter((selectFile) => selectFile.name !== removedFile.file.name)
        );
      }
    },
    [removeFile, uploadQueue]
  );

  // 实际执行上传
  const handleStartUpload = useCallback(
    async (replaceFiles: string[] = []) => {
      // 如果有需要替换的文件，标记这些文件为覆盖模式
      // 执行上传并获取结果，传递 replaceFiles 参数
      const { failed } = await startUpload(replaceFiles);

      // 检查上传结果
      if (failed.length === 0) {
        onClose?.();
        onSuccess?.();
      }
    },
    [startUpload, onClose, onSuccess]
  );

  // 处理确认上传 - 先检查重名
  const handleCheckAndImport = useCallback(async () => {
    // 检查是否有重名文件
    const fileNames = uploadQueue
      .filter((item) => item.status === FileStatus.PENDING)
      .map((item) => item.file.name);

    if (fileNames.length === 0) {
      return;
    }

    const checkResult = await postCheckDuplicateCollection({
      datasetId,
      fileNames
    });

    if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
      setDuplicateFiles(checkResult.duplicateFileNames);
      setShowDuplicateModal(true);
    } else {
      // 没有重名文件，直接上传
      await handleStartUpload();
    }
  }, [datasetId, handleStartUpload, uploadQueue]);

  // 处理跳过重名文件
  const handleSkipDuplicates = useCallback(async () => {
    const filesToUpload = uploadQueue.filter((item) => !duplicateFiles.includes(item.file.name));

    if (filesToUpload.length === 0) {
      toast({
        title: t('dataset:upload_other_files'),
        status: 'warning'
      });
      setShowDuplicateModal(false);
      return;
    }

    // 从队列中移除重名文件
    const duplicateIds = uploadQueue
      .filter((item) => duplicateFiles.includes(item.file.name))
      .map((item) => item.id);

    duplicateIds.forEach((id) => {
      removeFile(id);
    });

    setShowDuplicateModal(false);
    await handleStartUpload();
  }, [duplicateFiles, uploadQueue, removeFile, toast, t, handleStartUpload]);

  // 处理继续上传（不替换）
  const handleContinueUpload = useCallback(async () => {
    setShowDuplicateModal(false);
    await handleStartUpload();
  }, [handleStartUpload]);

  // 处理替换文件
  const handleReplaceFiles = useCallback(async () => {
    setShowDuplicateModal(false);
    // 标记需要替换的文件
    await handleStartUpload(duplicateFiles);
  }, [duplicateFiles, handleStartUpload]);

  // 重置状态
  const resetState = useCallback(() => {
    setSelectFiles([]);
    // 清空上传队列
    clearQueue();
  }, [clearQueue]);

  // 监听弹窗关闭
  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  const stats = getUploadStats();
  const hasFiles = stats.total > 0;
  const hasPendingFiles = stats.pending > 0;
  const hasUploadingFiles = stats.uploading > 0;
  const canUpload = hasPendingFiles && !hasUploadingFiles;

  return (
    <>
      <MyModal
        isOpen={isOpen}
        iconSrc="core/dataset/tableCollection"
        iconColor="primary.500"
        title={title || t('dataset:add_file')}
        w={'500px'}
        h={'auto'}
        closeOnOverlayClick={!isUploading}
      >
        <ModalBody py={4} px={8}>
          <VStack spacing={3} alignItems="stretch" w={'100%'} gap={0}>
            {/* 模板下载区域 */}
            <HStack>
              <Button
                variant={'whiteBase'}
                w={'100%'}
                leftIcon={<MyIcon name={'common/download'} w={4} />}
                onClick={handleDownloadTemplate}
              >
                {t('dataset:download_template')}
              </Button>
            </HStack>

            {/* 文件选择区域 */}
            <FileSelector
              my={4}
              fileType={acceptedTypes.join(',')}
              selectFiles={selectFiles}
              setSelectFiles={handleFileSelectorChange}
              maxCount={maxFiles}
              maxSize={maxFileSize}
              fileNameValidator={fileNameValidator}
              fileNameValidationError={t('dataset:filename_format_tip')}
              FileTypeNode={
                <Box fontSize={'xs'}>
                  <Trans
                    i18nKey={'file:template_csv_file_select_tip'}
                    values={{
                      fileType: acceptedTypes.join(t('common:comma_symbol'))
                    }}
                    components={{
                      highlight: <Box as="span" color="primary.600" fontWeight="medium" />
                    }}
                  />
                </Box>
              }
              fileTipNode={t('dataset:file_upload_tip', { maxCount: 10, maxSize: '50 MB' })}
              autoFilterOverSize={true}
            />

            {/* 文件列表 */}
            {hasFiles && (
              <FileList
                files={uploadQueue}
                onRemoveFile={handleRemoveFile}
                onRetryFailed={retryFailedFiles}
                disabled={isUploading}
              />
            )}
          </VStack>
        </ModalBody>

        <ModalFooter pt={4}>
          <Button mr={2} variant="outline" isDisabled={isUploading} onClick={onClose}>
            {cancelText || t('common:Cancel')}
          </Button>

          <Button
            colorScheme="blue"
            onClick={handleCheckAndImport}
            isDisabled={!canUpload}
            isLoading={hasUploadingFiles}
            loadingText={t('dataset:uploading_progress_with_count', { completedCount, totalCount })}
          >
            {hasUploadingFiles
              ? t('dataset:uploading_progress_with_count', { completedCount, totalCount })
              : confirmText || t('dataset:start_upload')}
          </Button>
        </ModalFooter>
      </MyModal>
      {/* 重名校验弹窗 */}
      <DuplicateConfirmModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        duplicateFiles={duplicateFiles}
        onSkipDuplicates={handleSkipDuplicates}
        onContinueUpload={handleContinueUpload}
        onReplaceFiles={handleReplaceFiles}
      />
    </>
  );
};

export default FileUploadModal;
