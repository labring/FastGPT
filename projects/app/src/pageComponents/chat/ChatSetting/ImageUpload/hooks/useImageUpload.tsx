import { useState, useRef, useCallback } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';

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

  const afterUploadAvatar = useCallback((avatar: string) => onFileSelect(avatar), [onFileSelect]);
  const {
    Component: SelectFileComponent,
    uploading: loading,
    handleFileSelectorOpen: onOpenSelectFile,
    handleUploadAvatar: handleFileSelect
  } = useUploadAvatar(getUploadAvatarPresignedUrl, { onSuccess: afterUploadAvatar });

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
      await handleFileSelect(files[0]);
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
