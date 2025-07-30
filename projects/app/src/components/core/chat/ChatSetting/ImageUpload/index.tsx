import React, { useState, useEffect } from 'react';
import { Box, Image, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useImageUpload } from './hooks/useImageUpload';
import type { PreviewFileItem } from '@/web/core/chat/context/chatSettingContext';
import { useMemoizedFn } from 'ahooks';

type Props = {
  imageSrc?: string;
  tips?: string;
  defaultImageSrc?: string;
  maxFiles?: number;
  maxSize?: number; // MB
  accept?: string;
  width?: string | number;
  height?: string | number;
  aspectRatio?: number;
  borderRadius?: string | number;
  disabled?: boolean;
  preview?: boolean;
  onFileSelect?: (previewFiles: PreviewFileItem[]) => void;
  previewFiles?: PreviewFileItem[];
};

const ImageUpload = ({
  imageSrc,
  tips,
  defaultImageSrc,
  maxFiles = 1,
  maxSize,
  accept = 'image/*',
  width,
  height,
  aspectRatio = 2.84 / 1,
  borderRadius = 'md',
  disabled = false,
  preview = false,
  onFileSelect,
  previewFiles: externalPreviewFiles
}: Props) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // 当imageSrc变化时重置错误状态
  useEffect(() => {
    setImageLoadError(false);
  }, [imageSrc]);

  const {
    SelectFileComponent,
    onOpenSelectFile,
    onSelectFile,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    isUploading,
    previewFiles: internalPreviewFiles
  } = useImageUpload({
    maxFiles,
    maxSize,
    accept,
    preview,
    onFileSelect
  });

  // 使用外部传入的预览文件或内部的预览文件
  const previewFiles = externalPreviewFiles || internalPreviewFiles;

  const handleClick = useMemoizedFn(() => {
    if (!disabled && !isUploading) {
      onOpenSelectFile();
    }
  });

  const handleFileSelect = useMemoizedFn((files: File[]) => {
    onSelectFile({ files });
  });

  const renderUploadArea = () => {
    // 优先显示预览图片（如果在预览模式且有预览文件）
    if (preview && previewFiles.length > 0) {
      const previewFile = previewFiles[0]; // 取第一个预览文件
      return (
        <Image
          src={previewFile.url}
          alt="Preview image"
          px={2}
          width="100%"
          height="100%"
          objectFit="contain"
        />
      );
    }

    // Show current image if exists
    if (imageSrc && !isUploading && !imageLoadError) {
      return (
        <Image
          src={imageSrc}
          alt="Uploaded image"
          px={2}
          width="100%"
          height="100%"
          objectFit="contain"
          borderRadius={borderRadius}
          onError={() => setImageLoadError(true)}
          onLoad={() => setImageLoadError(false)}
        />
      );
    }

    // Show default image when not hovered and no upload in progress
    if (defaultImageSrc && !isHovered && !isDragging && !isUploading) {
      return (
        <Image
          src={defaultImageSrc}
          alt="Default image"
          width="100%"
          height="100%"
          px={2}
          objectFit="contain"
          borderRadius={borderRadius}
        />
      );
    }

    // Show upload icon when hovered, dragging, or uploading
    return <MyIcon name={'upload'} w="24px" h="24px" />;
  };

  const renderUploadProgress = () => {
    // This component is no longer used for direct uploads, so this section is removed.
    return null;
  };

  return (
    <Box position="relative">
      <SelectFileComponent onSelect={handleFileSelect} />

      <Box
        width={width}
        height={height}
        aspectRatio={aspectRatio}
        bg={isDragging ? 'blue.50' : 'gray.50'}
        border="2px dashed"
        borderColor={isDragging ? 'blue.300' : 'gray.200'}
        borderRadius={borderRadius}
        cursor={disabled || isUploading ? 'not-allowed' : 'pointer'}
        position="relative"
        overflow="hidden"
        transition="all 0.2s"
        _hover={{
          bg: disabled || isUploading ? 'gray.50' : 'gray.100',
          borderColor: disabled || isUploading ? 'gray.200' : 'blue.300'
        }}
        onClick={handleClick}
        onMouseEnter={() => !disabled && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragEnter={!disabled ? handleDragEnter : undefined}
        onDragLeave={!disabled ? handleDragLeave : undefined}
        onDragOver={!disabled ? handleDragOver : undefined}
        onDrop={!disabled ? handleDrop : undefined}
        opacity={disabled ? 0.6 : 1}
      >
        <Flex width="100%" height="100%" align="center" justify="center" position="relative">
          {renderUploadArea()}
        </Flex>

        {renderUploadProgress()}
      </Box>

      {tips && (
        <Box fontSize="xs" color="gray.500" textAlign="start">
          {tips}
        </Box>
      )}
    </Box>
  );
};

export default ImageUpload;
