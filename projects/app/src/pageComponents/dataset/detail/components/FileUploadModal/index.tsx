import React, { useCallback, useEffect, useState, useRef } from 'react';
import { VStack, HStack, Button, ModalBody, ModalFooter, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useFileUpload, FileStatus } from './useFileUpload';
import FileList from './FileList';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FileSelector, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import { Trans } from 'next-i18next';
import { postCheckDuplicateCollection, postCheckMd5Duplicate } from '@/web/core/dataset/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import DuplicateConfirmModal from '../../RefinedCollectionCard/DuplicateConfirmModal';
import Md5DuplicateModal, {
  type Md5DuplicateItem
} from '../../RefinedCollectionCard/Md5DuplicateModal';
import ExcelJS from 'exceljs';
import SparkMD5 from 'spark-md5';

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
  parentId?: string; // 父目录ID（用于文件夹级别的重名检测）
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
  datasetId,
  parentId
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // 重名检测状态
  const [duplicateFiles, setDuplicateFiles] = useState<string[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // MD5 去重弹窗状态
  const [md5DuplicateFiles, setMd5DuplicateFiles] = useState<Md5DuplicateItem[]>([]);
  const [showMd5DuplicateModal, setShowMd5DuplicateModal] = useState(false);

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
    clearQueue,
    updateFileMd5Map
  } = useFileUpload({
    concurrency,
    uploadApi
  });

  // 文件名校验函数
  const fileNameValidator = useCallback((fileName: string) => {
    const reg = /^[a-zA-Z_\u4e00-\u9fff][a-zA-Z0-9_\u4e00-\u9fff]*$/;
    return reg.test(fileName);
  }, []);

  const pendingFilesRef = useRef<string[]>([]);

  /** 流式计算单个文件的 MD5，避免全量加载到内存 */
  const computeFileMd5 = async (file: File): Promise<string> => {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk
    const spark = new SparkMD5.ArrayBuffer();
    const stream = file.stream();
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      spark.append(value.buffer as ArrayBuffer);
    }

    return spark.end();
  };

  /** 批量计算文件 MD5 */
  const computeFilesMd5 = async (
    files: { name: string; file: File }[]
  ): Promise<Map<string, string>> => {
    const map = new Map<string, string>();
    for (const f of files) {
      const md5 = await computeFileMd5(f.file);
      map.set(f.name, md5);
    }
    return map;
  };

  // FileSelector 状态
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);

  // 下载模板文件 (XLSX格式，UTF-8编码) - 前端生成
  const handleDownloadTemplate = async () => {
    try {
      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Template');

      // 设置列宽
      worksheet.columns = [
        { width: 10 }, // id
        { width: 20 }, // name
        { width: 10 }, // age
        { width: 15 } // region
      ];

      // 添加表头（第一行）
      const headerRow = worksheet.addRow(['id', 'name', 'age', 'region']);

      // 设置表头样式
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // 添加示例数据
      worksheet.addRow([1, 'Alice', 30, 'US']);
      worksheet.addRow([2, 'Bob', 25, 'UK']);
      worksheet.addRow([3, 'Charlie', 35, 'US']);
      worksheet.addRow([4, 'Diana', 28, 'CN']);

      // 生成 Buffer（UTF-8编码）
      const buffer = await workbook.xlsx.writeBuffer();

      // 创建 Blob 并下载
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'file_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download template:', error);
    }
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

  /** 获取当前所有 pending 文件（不依赖 useCallback 闭包中的旧值） */
  const getPendingFiles = useCallback(() => {
    // uploadQueue 在 useCallback 中会捕获旧值，所以这里返回空数组作为后备
    // 实际的 pending 文件名在 handleCheckAndImport 中重新计算
    return uploadQueue.filter((item) => item.status === FileStatus.PENDING);
  }, [uploadQueue]);

  // 实际执行上传
  const handleStartUpload = useCallback(
    async (replaceFiles: string[] = []) => {
      const { failed } = await startUpload(replaceFiles);

      if (failed.length === 0) {
        onClose?.();
        onSuccess?.();
      }
    },
    [startUpload, onClose, onSuccess]
  );

  // 处理确认上传 - 先做 MD5 去重，再检查文件名重名
  const handleCheckAndImport = useCallback(async () => {
    const pendingFiles = getPendingFiles();

    if (pendingFiles.length === 0) {
      return;
    }

    // 1. 计算所有文件的 MD5
    const md5Map = await computeFilesMd5(
      pendingFiles.map((f) => ({ name: f.file.name, file: f.file }))
    );

    // 设置所有文件的 fileMd5
    updateFileMd5Map(md5Map);

    // 2. 统一调用 md5Duplicate API 检测同批次内重复 + 与知识库已有文件重复
    const md5Record: Record<string, string> = {};
    const pendingFileNames = pendingFiles.map((f) => f.file.name);
    for (const name of pendingFileNames) {
      const md5 = md5Map.get(name);
      if (md5) md5Record[name] = md5;
    }
    if (Object.keys(md5Record).length > 0) {
      const md5CheckResult = await postCheckMd5Duplicate({ datasetId, md5Map: md5Record });

      if (md5CheckResult.duplicates && md5CheckResult.duplicates.length > 0) {
        // 弹出 MD5 重复确认弹窗
        setMd5DuplicateFiles(md5CheckResult.duplicates);
        setShowMd5DuplicateModal(true);
        return;
      }
    }

    // 3. 获取最终文件名列表
    const finalNames = pendingFileNames;

    // 存储最终的文件列表供后续 handlers 使用
    pendingFilesRef.current = finalNames;

    // 4. 文件名重复检查
    const checkResult = await postCheckDuplicateCollection({
      datasetId,
      parentId: parentId || undefined,
      fileNames: finalNames
    });

    if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
      setDuplicateFiles(checkResult.duplicateFileNames);
      setShowDuplicateModal(true);
    } else {
      await handleStartUpload();
    }
  }, [
    getPendingFiles,
    datasetId,
    parentId,
    removeFile,
    toast,
    t,
    handleStartUpload,
    updateFileMd5Map
  ]);

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

  // MD5 去重弹窗确认：过滤掉重复文件后继续上传
  const handleMd5Confirm = useCallback(async () => {
    const md5DupNewNames = new Set(md5DuplicateFiles.map((d) => d.newFileName));

    // 从队列中移除 MD5 重复的文件
    const dupIds = uploadQueue
      .filter((item) => md5DupNewNames.has(item.file.name))
      .map((item) => item.id);
    dupIds.forEach((id) => removeFile(id));

    setShowMd5DuplicateModal(false);

    // 继续文件名重复检查
    const remainingFiles = uploadQueue.filter(
      (item) => !dupIds.includes(item.id) && item.status === FileStatus.PENDING
    );
    const remainingNames = remainingFiles.map((f) => f.file.name);

    if (remainingNames.length === 0) {
      setSelectFiles([]);
      toast({
        title: t('dataset:upload_other_files'),
        status: 'warning'
      });
      return;
    }

    // 存储剩余文件列表供后续 handlers 使用
    pendingFilesRef.current = remainingNames;

    const checkResult = await postCheckDuplicateCollection({
      datasetId,
      parentId: parentId || undefined,
      fileNames: remainingNames
    });

    if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
      setDuplicateFiles(checkResult.duplicateFileNames);
      setShowDuplicateModal(true);
    } else {
      await handleStartUpload();
    }
  }, [
    md5DuplicateFiles,
    uploadQueue,
    removeFile,
    datasetId,
    parentId,
    toast,
    t,
    handleStartUpload
  ]);

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
      {/* MD5 重复弹窗 */}
      <Md5DuplicateModal
        isOpen={showMd5DuplicateModal}
        onClose={() => setShowMd5DuplicateModal(false)}
        md5DuplicateFiles={md5DuplicateFiles}
        onConfirm={handleMd5Confirm}
      />
    </>
  );
};

export default FileUploadModal;
