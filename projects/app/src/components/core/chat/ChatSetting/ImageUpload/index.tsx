import React, { useState, useEffect } from 'react';
import { Box, Image, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useImageUpload, type UploadedFileItem } from './hooks/useImageUpload';
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
  onFileSelect?: (uploadedFiles: UploadedFileItem[]) => void;
  uploadedFiles?: UploadedFileItem[];
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
  onFileSelect,
  uploadedFiles: externalUploadedFiles
}: Props) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // reset image load error when imageSrc changes
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
    loading,
    uploadedFiles: internalUploadedFiles
  } = useImageUpload({
    maxFiles,
    maxSize,
    accept,
    onFileSelect
  });

  // use external uploaded files or internal uploaded files
  const uploadedFiles = externalUploadedFiles || internalUploadedFiles;

  const handleClick = useMemoizedFn(() => {
    if (!disabled && !loading) {
      onOpenSelectFile();
    }
  });

  const renderUploadArea = () => {
    if (isHovered && !isDragging && !loading) {
      return <MyIcon name={'upload'} w="24px" h="24px" />;
    }

    // show uploaded image
    if (uploadedFiles.length > 0) {
      const uploadedFile = uploadedFiles[0]; // get first uploaded file
      return (
        <Image
          src={uploadedFile.url}
          alt="Uploaded image"
          px={2}
          width="100%"
          height="100%"
          objectFit="contain"
        />
      );
    }

    // show current image if exists
    if (imageSrc && !loading && !imageLoadError) {
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

    // show default image when not hovered and no upload in progress
    if (defaultImageSrc && !isHovered && !isDragging && !loading) {
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
  };

  return (
    <Box position="relative">
      <SelectFileComponent onSelect={onSelectFile} />

      <Box
        width={width}
        height={height}
        aspectRatio={aspectRatio}
        bg={isDragging ? 'blue.50' : 'gray.50'}
        border="2px dashed"
        borderColor={isDragging ? 'blue.300' : 'gray.200'}
        borderRadius={borderRadius}
        cursor={disabled || loading ? 'not-allowed' : 'pointer'}
        position="relative"
        overflow="hidden"
        transition="all 0.2s"
        _hover={{
          bg: disabled || loading ? 'gray.50' : 'gray.100',
          borderColor: disabled || loading ? 'gray.200' : 'blue.300'
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
