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
  cancelText
}) => {
  const { t } = useTranslation();

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

  // 处理确认上传
  const handleConfirm = useCallback(async () => {
    // 执行上传并获取结果
    const { failed } = await startUpload();

    // 检查上传结果
    if (failed.length === 0) {
      onClose?.();
      onSuccess?.();
    }
  }, [startUpload, onClose, onSuccess]);

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
          onClick={handleConfirm}
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
  );
};

export default FileUploadModal;
