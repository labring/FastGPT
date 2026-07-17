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
import { type FieldErrors, useForm, useWatch } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const ACCEPT_TYPE = '.zip';
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
  onSuccess?: (skillId: string) => void | Promise<void>;
};

const ImportSkillModal = ({ parentId, onClose, onSuccess }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const [isDragging, setIsDragging] = useState(false);
  const maxUploadBytes = feConfigs?.limit?.skillSandboxMaxBytes;
  const { register, handleSubmit, setValue, control } = useForm<ImportSkillFormType>({
    defaultValues: {
      name: '',
      avatar: DEFAULT_SKILL_AVATAR
    }
  });
  const avatar = useWatch({ control, name: 'avatar' });
  const selectedFile = useWatch({ control, name: 'file' });

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
    fileType: ACCEPT_TYPE,
    multiple: false,
    maxCount: 1
  });

  const { runAsync: importSkillReq, loading: isImporting } = useRequest(
    ({ name, avatar, file }: ValidImportSkillFormType) => {
      return importSkill({
        file,
        name: name.trim() || undefined,
        avatar,
        parentId: parentId ?? undefined
      });
    },
    {
      successToast: t('common:import_success'),
      errorToast: t('common:import_failed')
    }
  );

  const handleImport = async (data: ImportSkillFormType) => {
    if (!data.file) return;
    const skillId = await importSkillReq({
      ...data,
      name: data.name.trim(),
      file: data.file
    });
    // 导入成功后立即关闭弹窗。
    onClose();
    // 关联/刷新交给调用方，由调用方自行处理异常。
    await onSuccess?.(skillId);
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
      if (!file.name.toLowerCase().endsWith(ACCEPT_TYPE)) {
        toast({
          status: 'warning',
          title: t('skill:unsupported_file_format', {
            ext: file.name.slice(file.name.lastIndexOf('.'))
          })
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
        size={'md'}
        isCentered
        borderRadius={'10px'}
        closeOnOverlayClick={false}
        footer={
          <>
            <Button h={'32px'} variant={'whiteBase'} onClick={onClose}>
              {t('common:Cancel')}
            </Button>
            <Button
              h={'32px'}
              isLoading={isImporting}
              onClick={handleSubmit(handleImport, handleInvalid)}
            >
              {t('common:Confirm')}
            </Button>
          </>
        }
      >
        <Flex flexDirection={'column'} gap={4}>
          <Box>
            <FormLabel mb={2}>{t('skill:import_skill_select_file')}</FormLabel>
            {selectedFile ? (
              <Flex
                h={'220px'}
                alignItems={'center'}
                justifyContent={'center'}
                gap={2}
                border={'1px solid'}
                borderColor={'myGray.200'}
                borderRadius={'md'}
                p={3}
              >
                <MyIcon
                  name={'common/importLight'}
                  w={'24px'}
                  flexShrink={0}
                  color={'myGray.500'}
                />
                <Box maxW={'260px'} fontSize={'sm'} color={'myGray.700'} isTruncated>
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
                h={'220px'}
                flexDirection={'column'}
                alignItems={'center'}
                justifyContent={'center'}
                px={3}
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
                <MyIcon name={'common/uploadFileFill'} w={'32px'} color={'primary.600'} />
                <Box fontWeight={'bold'} mt={2}>
                  {isDragging
                    ? t('file:release_the_mouse_to_upload_the_file')
                    : t('file:select_and_drag_file_tip')}
                </Box>
                <Box color={'myGray.500'} fontSize={'xs'} mt={1}>
                  {t('skill:import_skill_file_type_tip', { ext: ACCEPT_TYPE })}
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
          </Box>

          <Box>
            <FormLabel mb={2}>{t('skill:skill_avatar_and_name')}</FormLabel>
            <Flex alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Flex
                  borderRadius={'4px'}
                  w={'32px'}
                  h={'32px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  justifyContent={'center'}
                  alignItems={'center'}
                  mr={3}
                  p={'4px'}
                  cursor={'pointer'}
                  onClick={handleAvatarSelectorOpen}
                >
                  <Avatar src={avatar} w={'24px'} borderRadius={'4px'} />
                </Flex>
              </MyTooltip>
              <Input
                flex={1}
                h={'32px'}
                placeholder={t('skill:unnamed_skill')}
                {...register('name', {
                  setValueAs: (value: string) => value.trim()
                })}
              />
            </Flex>
          </Box>

          <FileInput onSelect={(files) => files[0] && handleFile(files[0])} />
        </Flex>
      </MyModal>
      <AvatarUploader />
    </>
  );
};

export default ImportSkillModal;
