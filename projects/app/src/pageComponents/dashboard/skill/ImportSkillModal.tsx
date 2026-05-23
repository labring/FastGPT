import React, { type DragEvent, useCallback, useEffect, useState } from 'react';
import { Box, Button, Flex, Input } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSelectFile } from '@fastgpt/web/common/file/hooks/useSelectFile';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { importSkill } from '@/web/core/skill/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { type FieldErrors, useForm } from 'react-hook-form';

const ACCEPT_TYPES = '.zip,.tar,.tar.gz';
const DEFAULT_SKILL_AVATAR = 'core/skill/default';

type ImportSkillFormType = {
  name: string;
  avatar: string;
  file?: File;
};

type ValidImportSkillFormType = ImportSkillFormType & {
  file: File;
};

type Props = {
  parentId?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
};

const isValidFile = (file: File) => {
  const name = file.name.toLowerCase();
  return name.endsWith('.zip') || name.endsWith('.tar') || name.endsWith('.tar.gz');
};

const getFileExt = (file: File): string => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.tar.gz')) return '.tar.gz';
  const match = name.match(/\.[^.]+$/);
  return match ? match[0] : '';
};

const ImportSkillModal = ({ parentId, onClose, onSuccess }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const [isDragging, setIsDragging] = useState(false);
  const maxUploadBytes = feConfigs?.limit?.agentSkillMaxUploadBytes;
  const { register, handleSubmit, setValue, watch } = useForm<ImportSkillFormType>({
    defaultValues: {
      name: '',
      avatar: DEFAULT_SKILL_AVATAR
    }
  });
  const avatar = watch('avatar');
  const selectedFile = watch('file');

  useEffect(() => {
    register('file', { required: true });
  }, [register]);

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(newAvatar) {
        setValue('avatar', newAvatar);
      }
    });

  const { File: FileInput, onOpen } = useSelectFile({
    fileType: ACCEPT_TYPES,
    multiple: false,
    maxCount: 1
  });

  const { runAsync: onImport, loading: isImporting } = useRequest(
    ({ name, avatar, file }: ValidImportSkillFormType) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      formData.append('avatar', avatar);
      if (parentId) formData.append('parentId', parentId);
      return importSkill(formData);
    },
    {
      onSuccess() {
        onSuccess?.();
        onClose();
      },
      successToast: t('common:import_success'),
      errorToast: t('common:import_failed')
    }
  );

  const handleImport = async (data: ImportSkillFormType) => {
    if (!data.file) return;
    await onImport({
      ...data,
      file: data.file
    });
  };

  const handleInvalid = (errors: FieldErrors<ImportSkillFormType>) => {
    if (errors.name) return;

    if (errors.file) {
      toast({
        status: 'warning',
        title: t('skill:import_skill_select_file')
      });
    }
  };

  const handleFile = useCallback(
    (file: File) => {
      if (!isValidFile(file)) {
        const ext = getFileExt(file);
        toast({
          status: 'warning',
          title: t('skill:unsupported_file_format', { ext })
        });
        return;
      }
      if (typeof maxUploadBytes === 'number' && file.size > maxUploadBytes) {
        toast({
          status: 'warning',
          title: t('file:some_file_size_exceeds_limit', {
            maxSize: formatFileSize(maxUploadBytes)
          })
        });
        return;
      }
      setValue('file', file, {
        shouldDirty: true,
        shouldValidate: true
      });
    },
    [maxUploadBytes, setValue, t, toast]
  );

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        title={t('skill:import_skill')}
        iconSrc="common/importLight"
        iconColor={'primary.600'}
        size={'md'}
        contentPx={'32px'}
        contentPy={'32px'}
        borderRadius={'10px'}
        closeOnOverlayClick={false}
      >
        <Flex flexDirection={'column'} gap={6}>
          <Box color={'myGray.800'} fontWeight={'bold'}>
            {t('common:input_name')}
            <Flex mt={2} alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Avatar
                  flexShrink={0}
                  src={avatar}
                  w={['1.75rem', '2.25rem']}
                  h={['1.75rem', '2.25rem']}
                  cursor={'pointer'}
                  borderRadius={'md'}
                  onClick={handleAvatarSelectorOpen}
                />
              </MyTooltip>
              <Input
                flex={1}
                ml={3}
                autoFocus
                placeholder={t('skill:skill_name_placeholder')}
                {...register('name', {
                  required: true,
                  setValueAs: (value: string) => value.trim()
                })}
              />
            </Flex>
          </Box>

          {selectedFile ? (
            <Flex
              alignItems={'center'}
              gap={2}
              border={'1px solid'}
              borderColor={'myGray.200'}
              borderRadius={'md'}
              p={3}
            >
              <MyIcon name={'common/importLight'} w={'24px'} flexShrink={0} color={'myGray.500'} />
              <Box flex={1} fontSize={'sm'} color={'myGray.700'} isTruncated>
                {selectedFile.name}
              </Box>
              <Box fontSize={'xs'} color={'myGray.500'} flexShrink={0}>
                {formatFileSize(selectedFile.size)}
              </Box>
              <Box
                cursor={'pointer'}
                color={'myGray.400'}
                _hover={{ color: 'myGray.700' }}
                onClick={() =>
                  setValue('file', undefined, {
                    shouldDirty: true,
                    shouldValidate: true
                  })
                }
                flexShrink={0}
              >
                <MyIcon name={'common/closeLight'} w={'16px'} />
              </Box>
            </Flex>
          ) : (
            <Flex
              flexDirection={'column'}
              alignItems={'center'}
              justifyContent={'center'}
              px={3}
              py={7}
              borderWidth={'1.5px'}
              borderStyle={'dashed'}
              borderRadius={'md'}
              cursor={'pointer'}
              borderColor={isDragging ? 'primary.600' : 'borderColor.high'}
              _hover={{ bg: 'primary.50', borderColor: 'primary.600' }}
              onDragEnter={handleDragEnter}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={onOpen}
            >
              <MyIcon name={'common/uploadFileFill'} w={'32px'} />
              <Box fontWeight={'bold'} mt={2}>
                {isDragging
                  ? t('file:release_the_mouse_to_upload_the_file')
                  : t('file:select_and_drag_file_tip')}
              </Box>
              <Box color={'myGray.500'} fontSize={'xs'} mt={1}>
                {t('skill:import_skill_file_type_tip', { ext: ACCEPT_TYPES.split(',').join(' ') })}
              </Box>
              {typeof maxUploadBytes === 'number' && (
                <Box color={'myGray.500'} fontSize={'xs'}>
                  {t('skill:import_skill_max_size_tip', {
                    maxCount: 1,
                    maxSize: formatFileSize(maxUploadBytes)
                  })}
                </Box>
              )}
            </Flex>
          )}
          <FileInput onSelect={(files) => files[0] && handleFile(files[0])} />
          <Flex justifyContent={'flex-end'} gap={3}>
            <Button variant={'whiteBase'} onClick={onClose}>
              {t('common:Cancel')}
            </Button>
            <Button isLoading={isImporting} onClick={handleSubmit(handleImport, handleInvalid)}>
              {t('common:Confirm')}
            </Button>
          </Flex>
        </Flex>
      </MyModal>
      <AvatarUploader />
    </>
  );
};

export default ImportSkillModal;
