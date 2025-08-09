import { useState, useRef } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn } from 'ahooks';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type UploadedFileItem = {
  url: string;
  file: File;
};

type UseImageUploadProps = {
  maxSize?: number; // MB
  onFileSelect: (url: string) => void;
};

export const useImageUpload = ({ maxSize, onFileSelect }: UseImageUploadProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // use system config max size, but cap to match server limit
  // server validates the base64 string length (12MB), the original file should be smaller because the base64 encoding will increase the size by about 33%
  const configMaxSize = maxSize || feConfigs?.uploadFileMaxSize || 100; // MB
  const serverLimitMB = 12; // server base64 limit
  const clientLimitMB = Math.floor(serverLimitMB * 0.75); // considering the base64 encoding overhead, the client limit is set to 9MB
  const finalMaxSize = Math.min(configMaxSize, clientLimitMB);
  const maxSizeBytes = finalMaxSize * 1024 * 1024;

  const {
    File: SelectFileComponent,
    onOpen: onOpenSelectFile,
    onSelectImage,
    loading
  } = useSelectFile({
    fileType: 'image/*',
    multiple: false,
    maxCount: 1
  });

  // validate file size
  const validateFile = useMemoizedFn((file: File): string | null => {
    if (file.size > maxSizeBytes) {
      return t('chat:setting.copyright.file_size_exceeds_limit', {
        maxSize: formatFileSize(maxSizeBytes)
      });
    }
    return null;
  });

  // handle file select - immediate upload if enabled
  const handleFileSelect = useMemoizedFn(async (files: File[]) => {
    const file = files[0];

    const validationError = validateFile(file);
    if (validationError) {
      toast({
        status: 'warning',
        title: validationError
      });
    }

    try {
      // 立即上传文件，带TTL
      const url = await onSelectImage([file], { maxW: 1000, maxH: 1000 });
      onFileSelect(url);
    } catch (error) {
      console.error('Failed to upload file:', error);
    }
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
      await handleFileSelect(files);
    }
  });

  return {
    SelectFileComponent,
    onOpenSelectFile,
    onSelectFile: handleFileSelect,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    loading
  };
};
