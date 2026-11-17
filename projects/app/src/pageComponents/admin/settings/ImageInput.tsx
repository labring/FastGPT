import { AddIcon, CloseIcon } from '@chakra-ui/icons';
import { Box, IconButton } from '@chakra-ui/react';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import React, { useCallback } from 'react';
import type { FieldValues, UseControllerProps } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';

type ImageInputProps<T extends FieldValues> = UseControllerProps<T> & {
  uploadMaxW?: number;
  uploadMaxH?: number;
  uploadMaxSize?: number;
};

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
    <>
      <AvatarUploader />

      {value ? (
        <Box position="relative" display="inline-block" w={28} h={28} role="group">
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
          <IconButton
            aria-label="clear image"
            icon={<CloseIcon boxSize={2.5} />}
            size="xs"
            minW={5}
            h={5}
            borderRadius="full"
            position="absolute"
            top={-2}
            right={-2}
            bg="myGray.700"
            color="white"
            _hover={{ bg: 'red.500' }}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
          />
        </Box>
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
    </>
  );
}

export default ImageInput;
