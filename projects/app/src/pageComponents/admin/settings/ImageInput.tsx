import { AddIcon } from '@chakra-ui/icons';
import { Box } from '@chakra-ui/react';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import React, { useCallback } from 'react';
import type { FieldValues, UseControllerProps } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';

interface ImageInputProps<T extends FieldValues> extends UseControllerProps<T> {
  uploadMaxW?: number;
  uploadMaxH?: number;
  uploadMaxSize?: number;
}

function ImageInput<T extends FieldValues>({
  control,
  name,
  uploadMaxW,
  uploadMaxH,
  uploadMaxSize
}: ImageInputProps<T>) {
  const {
    field: { onChange, value }
  } = useController({ control, name });

  const afterUploadAvatar = useCallback((avatar: string) => onChange(avatar), [onChange]);
  const { Component: AvatarUploader, handleFileSelectorOpen } = useUploadAvatar(
    getUploadAvatarPresignedUrl,
    {
      onSuccess: afterUploadAvatar,
      maxW: uploadMaxW,
      maxH: uploadMaxH,
      maxSize: uploadMaxSize
    }
  );
  return (
    <Box mt={4} mb={4}>
      <AvatarUploader />

      {value ? (
        <MyImage
          src={value}
          alt="image"
          w={28}
          h={28}
          cursor="pointer"
          borderWidth={1}
          borderStyle="solid"
          borderColor="#CED5E4"
          onClick={handleFileSelectorOpen}
          objectFit={'contain'}
        />
      ) : (
        <Box
          w={28}
          h={28}
          cursor="pointer"
          borderWidth={1}
          borderStyle="solid"
          display="flex"
          justifyContent="center"
          alignItems="center"
          fontSize="2xl"
          onClick={handleFileSelectorOpen}
        >
          <AddIcon />
        </Box>
      )}
    </Box>
  );
}

export default ImageInput;
