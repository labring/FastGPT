import React, { useState } from 'react';
import { Box, Flex, Button, ModalBody, Input, Textarea, ModalFooter } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { HttpPluginImgUrl } from '@fastgpt/global/common/file/image/constants';
import { postCreateHttpTools } from '@/web/core/app/api/plugin';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { useRouter } from 'next/router';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';

export type HttpToolsType = {
  id?: string;
  avatar: string;
  name: string;
  intro?: string;
  baseUrl?: string;
  apiSchemaStr?: string;
  customHeaders?: string;
  headerSecret?: StoreSecretValueType;
};

const defaultHttpTools: HttpToolsType = {
  avatar: HttpPluginImgUrl,
  name: '',
  intro: ''
};

const HttpPluginCreateModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const router = useRouter();

  const [createType, setCreateType] = useState<'batch' | 'manual'>('batch');

  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);

  const { register, setValue, handleSubmit, watch } = useForm<HttpToolsType>({
    defaultValues: defaultHttpTools
  });
  const avatar = watch('avatar');
  const nameValue = watch('name');

  const { runAsync: onCreate, loading: isCreating } = useRequest2(
    async (data: HttpToolsType) => {
      return postCreateHttpTools({
        createType,
        parentId,
        name: data.name,
        intro: data.intro,
        avatar: data.avatar
      });
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
        loadMyApps();
        onClose();
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(avatar) {
        setValue('avatar', avatar);
      }
    });

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        iconSrc="core/app/type/httpPluginFill"
        title={t('app:create_http_toolset')}
        w={['90vw', '530px']}
        position={'relative'}
      >
        <ModalBody flex={'0 1 auto'} overflow={'auto'} pb={0} px={9}>
          <Box color={'myGray.900'} fontWeight={'medium'} fontSize={'14px'}>
            {t('common:input_name')}
          </Box>
          <Flex mt={3} alignItems={'center'}>
            <MyTooltip label={t('common:set_avatar')}>
              <Avatar
                flexShrink={0}
                src={avatar}
                w={['28px', '32px']}
                h={['28px', '32px']}
                cursor={'pointer'}
                borderRadius={'md'}
                onClick={handleAvatarSelectorOpen}
              />
            </MyTooltip>
            <Input
              flex={1}
              ml={4}
              bg={'myWhite.600'}
              {...register('name', {
                required: t('common:name_is_empty')
              })}
            />
          </Flex>
          <Box color={'myGray.900'} fontWeight={'medium'} mt={6} fontSize={'14px'}>
            {t('common:core.app.App intro')}
          </Box>
          <Textarea
            {...register('intro')}
            bg={'myWhite.600'}
            h={'122px'}
            rows={3}
            mt={3}
            placeholder={t('common:core.app.Make a brief introduction of your app')}
          />
          <Box display={'flex'} alignItems={'center'} py={1} gap={'281px'} mt={6}>
            <Box color={'myGray.900'} fontWeight={'medium'} fontSize={'14px'}>
              {t('app:HTTPTools_Create_Type')}
            </Box>
            <Box
              display={'flex'}
              justifyContent={'center'}
              alignItems={'center'}
              ml={'auto'}
              gap={'4px'}
            >
              <MyIcon name={'common/info'} w={'16px'} h={'16px'} />
              <Box
                fontSize={'12px'}
                fontStyle={'normal'}
                fontWeight={'500'}
                lineHeight={'16px'}
                letterSpacing={'0.5px'}
              >
                {t('app:HTTPTools_Create_Type_Tip')}
              </Box>
            </Box>
          </Box>
          <Box my={2}>
            <LeftRadio
              list={[
                {
                  title: t('app:type.Http batch'),
                  value: 'batch',
                  desc: t('app:type.Http batch tip')
                },
                {
                  title: t('app:type.Http manual'),
                  value: 'manual',
                  desc: t('app:type.Http manual tip')
                }
              ]}
              value={createType}
              fontSize={'xs'}
              onChange={(e) => setCreateType(e as 'batch' | 'manual')}
              defaultBg={'white'}
              activeBg={'white'}
              py={2}
              px={3}
              gridGap={4}
            />
          </Box>
        </ModalBody>

        <ModalFooter mt={4} mb={6} py={0} px={9}>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            isDisabled={!nameValue?.trim()}
            onClick={handleSubmit((data) => onCreate(data))}
            isLoading={isCreating}
          >
            {t('common:comfirn_create')}
          </Button>
        </ModalFooter>
      </MyModal>
      <AvatarUploader />
    </>
  );
};

export default HttpPluginCreateModal;
