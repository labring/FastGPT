import { useCallback, useState, useRef } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn } from 'ahooks';
import { useSelectFile } from '@fastgpt/web/common/file/hooks/useSelectFile';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { PreviewFileItem } from '@/web/core/chat/context/chatSettingContext';

type UseImageUploadProps = {
  maxFiles?: number;
  maxSize?: number; // MB
  accept?: string;
  preview?: boolean;
  onFileSelect?: (previewFiles: PreviewFileItem[]) => void;
};

export const useImageUpload = ({
  maxFiles = 1,
  maxSize,
  accept = 'image/*',
  preview = false,
  onFileSelect
}: UseImageUploadProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [isDragging, setIsDragging] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<PreviewFileItem[]>([]);
  const dragCounter = useRef(0);

  // 使用系统配置的最大大小
  const finalMaxSize = maxSize || feConfigs?.uploadFileMaxSize || 100; // MB
  const maxSizeBytes = finalMaxSize * 1024 * 1024;

  const { File: SelectFileComponent, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: accept,
    multiple: maxFiles > 1,
    maxCount: maxFiles
  });

  // 验证文件大小
  const validateFile = useMemoizedFn((file: File): string | null => {
    if (file.size > maxSizeBytes) {
      return t('file:file_size_exceeds_limit', { maxSize: formatFileSize(maxSizeBytes) });
    }
    return null;
  });

  // 将 File 转换为 base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // 处理文件预览
  const handlePreview = useMemoizedFn(async (files: File[]) => {
    if (files.length === 0) return;

    const filesToPreview = files.slice(0, maxFiles);
    if (files.length > maxFiles) {
      toast({
        status: 'warning',
        title: t('file:select_file_amount_limit', { max: maxFiles })
      });
    }

    const previewItems: PreviewFileItem[] = [];

    for (const file of filesToPreview) {
      const validationError = validateFile(file);
      if (validationError) {
        toast({
          status: 'warning',
          title: validationError
        });
        continue;
      }

      try {
        const previewUrl = await fileToBase64(file);
        previewItems.push({
          file,
          url: previewUrl
        });
      } catch (error) {
        console.error('Failed to create preview:', error);
      }
    }

    setPreviewFiles(previewItems);
    onFileSelect?.(previewItems);
  });

  const handleFiles = useMemoizedFn(async (files: File[]) => {
    if (files.length === 0) return;

    if (preview) {
      // 预览模式：只生成预览，不上传
      await handlePreview(files);
    } else {
      // 非预览模式：显示错误提示，因为现在只支持预览模式
      toast({
        status: 'warning',
        title: '当前只支持预览模式上传'
      });
    }
  });

  // 清除预览文件
  const clearPreviewFiles = useMemoizedFn(() => {
    setPreviewFiles([]);
  });

  const onSelectFile = useMemoizedFn(async ({ files }: { files: File[] }) => {
    await handleFiles(files);
  });

  // 拖拽处理
  const handleDragEnter = useMemoizedFn((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  });

  const handleDragLeave = useMemoizedFn((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  });

  const handleDragOver = useMemoizedFn((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  });

  const handleDrop = useMemoizedFn(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await handleFiles(files);
    }
  });

  const isUploading = false; // No longer uploading files

  return {
    SelectFileComponent,
    onOpenSelectFile,
    onSelectFile,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    uploadingFiles: [], // No longer uploading files
    isUploading,
    handleFiles,
    previewFiles,
    clearPreviewFiles
  };
};
