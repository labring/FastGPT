import React, { useState, useEffect } from 'react';
import { Box, Image, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useImageUpload } from './hooks/useImageUpload';
import { useMemoizedFn } from 'ahooks';
import MyLoading from '@fastgpt/web/components/common/MyLoading';

type Props = {
  imageSrc: string;
  onFileSelect: (url: string) => void;
  tips?: string;
  maxSize?: number; // MB
  width?: string | number;
  height?: string | number;
  aspectRatio?: number;
  borderRadius?: string | number;
  disabled?: boolean;
};

const ImageUpload = ({
  imageSrc,
  tips,
  maxSize,
  width,
  height,
  aspectRatio = 2.84 / 1,
  borderRadius = 'md',
  disabled = false,
  onFileSelect
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
    loading
  } = useImageUpload({
    maxSize,
    onFileSelect
  });

  const handleClick = useMemoizedFn(() => {
    if (!disabled && !loading) {
      onOpenSelectFile();
    }
  });

  const renderUploadArea = () => {
    if (loading) {
      return <MyLoading fixed={false} />;
    }
    if (isHovered && !isDragging) {
      return <MyIcon name={'upload'} w="24px" h="24px" />;
    }

    // show uploaded image
    return (
      <Image
        src={imageSrc}
        alt="Uploaded image"
        px={2}
        width="100%"
        height="100%"
        objectFit="contain"
      />
    );
  };

  return (
    <Box position="relative">
      <SelectFileComponent />

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
