import React, { useState } from 'react';
import { Box, Flex, Button, ModalBody, Input, Textarea, ModalFooter } from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { HttpPluginImgUrl } from '@fastgpt/global/common/file/image/constants';
import { postCreateHttpPlugin } from '@/web/core/app/api/plugin';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';

export type EditHttpPluginProps = {
  id?: string;
  avatar: string;
  name: string;
  intro?: string;
  pluginData?: AppSchema['pluginData'];
};
export const defaultHttpPlugin: EditHttpPluginProps = {
  avatar: HttpPluginImgUrl,
  name: '',
  intro: '',
  pluginData: {
    apiSchemaStr: '',
    customHeaders: '{"Authorization":"Bearer"}'
  }
};

const HttpPluginEditModal = ({
  defaultPlugin = defaultHttpPlugin,
  onClose
}: {
  defaultPlugin?: EditHttpPluginProps;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);

  const [createType, setCreateType] = useState<'batch' | 'manual'>('batch');

  const { register, setValue, handleSubmit, watch } = useForm<EditHttpPluginProps>({
    defaultValues: defaultPlugin
  });
  const avatar = watch('avatar');
  const nameValue = watch('name');

  const { mutate: onCreate, isLoading: isCreating } = useRequest({
    mutationFn: async (data: EditHttpPluginProps) => {
      return postCreateHttpPlugin({
        parentId,
        name: data.name,
        intro: data.intro,
        avatar: data.avatar,
        pluginData: {
          apiSchemaStr: createType === 'batch' ? '{}' : '',
          customHeaders: data.pluginData?.customHeaders || '{"Authorization":"Bearer"}'
        }
      });
    },
    onSuccess() {
      loadMyApps();
      onClose();
    },
    successToast: t('common:create_success'),
    errorToast: t('common:create_failed')
  });

  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        iconSrc="core/app/type/httpPluginFill"
        title={t('common:plugin.Import Plugin')}
        w={['90vw', '600px']}
        maxH={['90vh', '80vh']}
        position={'relative'}
      >
        <ModalBody flex={'0 1 auto'} overflow={'auto'} pb={0} px={9}>
          <>
            <Box color={'myGray.800'} fontWeight={'bold'}>
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
                  onClick={onOpenSelectFile}
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
            <>
              <Box color={'myGray.800'} fontWeight={'bold'} mt={6}>
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
            </>
          </>
          <>
            <Box display={'flex'} alignItems={'center'} py={1} gap={'281px'} mt={6}>
              <Box color={'myGray.800'} fontWeight={'bold'}>
                {t('common:plugin.Create Type')}
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
                  {t('common:plugin.Create Type Tip')}
                </Box>
              </Box>
            </Box>
            <Box mt={2}>
              {/* 现在还没有更新功能，所以不支持更改 */}
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
              />
            </Box>
          </>
        </ModalBody>

        <ModalFooter my={6} py={0} px={9}>
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
      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
    </>
  );
};

export default HttpPluginEditModal;
