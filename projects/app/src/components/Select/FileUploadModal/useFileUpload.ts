import { useState, useCallback } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export enum FileStatus {
  PENDING = 'pending', // 等待上传
  UPLOADING = 'uploading', // 上传中
  SUCCESS = 'success', // 上传成功
  FAILED = 'failed' // 上传失败
}

export interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  result?: any;
  icon?: string; // 添加图标字段
  overwriteDuplicate?: boolean; // 是否覆盖重名文件
}

export interface UploadConfig {
  concurrency: number;
  uploadApi: (
    file: File,
    onProgress?: (progress: number) => void,
    overwriteDuplicate?: boolean
  ) => Promise<any>;
}

export const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

export const useFileUpload = (config: UploadConfig) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [uploadQueue, setUploadQueue] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const uploadFile = useCallback(
    async (fileItem: FileItem): Promise<FileItem> => {
      try {
        // 更新状态为上传中
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === fileItem.id
              ? { ...item, status: FileStatus.UPLOADING, progress: 0, error: undefined }
              : item
          )
        );

        const result = await config.uploadApi(
          fileItem.file,
          (progress) => {
            setUploadQueue((prev) =>
              prev.map((item) => (item.id === fileItem.id ? { ...item, progress } : item))
            );
          },
          fileItem.overwriteDuplicate // 传递 overwriteDuplicate 参数
        );

        return {
          ...fileItem,
          status: FileStatus.SUCCESS,
          progress: 100,
          result
        };
      } catch (error: any) {
        return {
          ...fileItem,
          status: FileStatus.FAILED,
          error: error.message || t('file:upload_failed')
        };
      }
    },
    [config, t]
  );

  const markFilesForReplacement = useCallback((fileNames: string[]) => {
    setUploadQueue((prev) =>
      prev.map((item) =>
        fileNames.includes(item.file.name) ? { ...item, overwriteDuplicate: true } : item
      )
    );
  }, []);

  const startUpload = useCallback(
    async (replaceFileNames: string[] = []) => {
      const pendingFiles = uploadQueue.filter((item) => item.status === FileStatus.PENDING);

      if (pendingFiles.length === 0) {
        return { success: [], failed: [] };
      }

      setIsUploading(true);
      setTotalCount(pendingFiles.length);
      setCompletedCount(0);

      let allFailedFiles: FileItem[] = [];

      try {
        const chunks = chunkArray(pendingFiles, config.concurrency);

        for (const chunk of chunks) {
          const uploadPromises = chunk.map((file) => {
            // 检查该文件是否在替换列表中
            const shouldOverwrite = replaceFileNames.includes(file.file.name);

            // 只有在需要替换时才设置 overwriteDuplicate 属性
            const fileItemWithOverwrite = shouldOverwrite
              ? { ...file, overwriteDuplicate: true }
              : file;

            return uploadFile(fileItemWithOverwrite);
          });
          const results = await Promise.allSettled(uploadPromises);

          // 更新上传队列（由于 uploadFile 使用 try-catch，Promise 始终为 fulfilled）

          setUploadQueue((prev) => {
            const updatedQueue = [...prev];

            results.forEach((result, index) => {
              const fileItem = chunk[index];
              const queueIndex = updatedQueue.findIndex((item) => item.id === fileItem.id);

              if (queueIndex !== -1) {
                // 检查 Promise 状态，只有 fulfilled 状态才有 value 属性
                if (result.status === 'fulfilled') {
                  updatedQueue[queueIndex] = result.value;
                }
              }
            });

            return updatedQueue;
          });

          // 检查是否有失败的文件（由于 uploadFile 使用 try-catch，Promise 始终为 fulfilled）
          const hasFailed = results.some(
            (result) => result.status === 'fulfilled' && result.value.status === FileStatus.FAILED
          );

          // 更新完成计数
          const chunkCompletedCount = results.filter(
            (result) =>
              result.status === 'fulfilled' &&
              (result.value.status === FileStatus.SUCCESS ||
                result.value.status === FileStatus.FAILED)
          ).length;

          results.forEach((v) => {
            if (v.status === 'fulfilled') {
              v.value.status === FileStatus.FAILED && allFailedFiles.push(v.value);
            }
          });

          setCompletedCount((prev) => prev + chunkCompletedCount);

          if (hasFailed) {
            // 获取第一个失败文件的错误信息
            const failedResult = results.find(
              (result) => result.status === 'fulfilled' && result.value.status === FileStatus.FAILED
            );

            // 停止后续上传
            toast({
              status: 'error',
              title:
                failedResult?.status === 'fulfilled'
                  ? failedResult.value.error
                  : t('file:upload_failed')
            });
            break;
          }
        }
      } catch (error) {
        toast({
          status: 'error',
          title: t('file:upload_failed'),
          description: (error as Error).message || t('file:upload_error_description')
        });
      } finally {
        setIsUploading(false);
      }

      return { failed: allFailedFiles };
    },
    [uploadQueue, config.concurrency, uploadFile, toast, t]
  );

  const addFiles = useCallback((files: File[], icons?: string[]) => {
    const newFileItems: FileItem[] = files.map((file, index) => ({
      id: getNanoid(),
      file,
      status: FileStatus.PENDING,
      progress: 0,
      icon: icons?.[index] // 传入图标信息
    }));

    setUploadQueue((prev) => [...prev, ...newFileItems]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setUploadQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setUploadQueue([]);
    setCompletedCount(0);
    setTotalCount(0);
  }, []);

  const retryFailedFiles = useCallback(() => {
    setUploadQueue((prev) =>
      prev.map((item) =>
        item.status === FileStatus.FAILED
          ? { ...item, status: FileStatus.PENDING, progress: 0, error: undefined }
          : item
      )
    );
  }, []);

  const getUploadStats = useCallback(() => {
    const stats = {
      total: uploadQueue.length,
      pending: uploadQueue.filter((item) => item.status === FileStatus.PENDING).length,
      uploading: uploadQueue.filter((item) => item.status === FileStatus.UPLOADING).length,
      success: uploadQueue.filter((item) => item.status === FileStatus.SUCCESS).length,
      failed: uploadQueue.filter((item) => item.status === FileStatus.FAILED).length
    };
    return stats;
  }, [uploadQueue]);

  return {
    uploadQueue,
    isUploading,
    completedCount,
    totalCount,
    startUpload,
    addFiles,
    removeFile,
    clearQueue,
    retryFailedFiles,
    getUploadStats,
    markFilesForReplacement
  };
};
