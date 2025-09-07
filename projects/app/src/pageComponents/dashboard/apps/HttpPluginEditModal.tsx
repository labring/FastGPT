import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  ModalBody,
  Input,
  Textarea,
  TableContainer,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  ModalFooter
} from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { HttpPluginImgUrl } from '@fastgpt/global/common/file/image/constants';
import {
  postCreateHttpPlugin,
  putUpdateHttpPlugin,
  getApiSchemaByUrl
} from '@/web/core/app/api/plugin';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/httpPlugin/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import { type OpenApiJsonSchema } from '@fastgpt/global/core/app/httpPlugin/type';
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
  const { toast } = useToast();
  const isEdit = !!defaultPlugin.id;

  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);

  const [schemaUrl, setSchemaUrl] = useState('');
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>(() => {
    const keyValue = JSON.parse(defaultPlugin.pluginData?.customHeaders || '{}');
    return Object.keys(keyValue).map((key) => ({ key, value: keyValue[key] }));
  });
  const [updateTrigger, setUpdateTrigger] = useState(false);

  const [createType, setCreateType] = useState<'batch' | 'manual'>('batch');

  const { register, setValue, handleSubmit, watch } = useForm<EditHttpPluginProps>({
    defaultValues: defaultPlugin
  });
  const avatar = watch('avatar');
  const nameValue = watch('name');
  const apiSchemaStr = watch('pluginData.apiSchemaStr');
  const [apiData, setApiData] = useState<OpenApiJsonSchema>({ pathData: [], serverPath: '' });

  const { mutate: onCreate, isLoading: isCreating } = useRequest({
    mutationFn: async (data: EditHttpPluginProps) => {
      return postCreateHttpPlugin({
        parentId,
        name: data.name,
        intro: data.intro,
        avatar: data.avatar,
        pluginData: {
          apiSchemaStr: data.pluginData?.apiSchemaStr || '',
          customHeaders: data.pluginData?.customHeaders || ''
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

  const { mutate: updatePlugins, isLoading: isUpdating } = useRequest({
    mutationFn: async (data: EditHttpPluginProps) => {
      if (!data.id || !data.pluginData) return Promise.resolve('');

      return putUpdateHttpPlugin({
        appId: data.id,
        name: data.name,
        intro: data.intro,
        avatar: data.avatar,
        pluginData: data.pluginData
      });
    },
    onSuccess() {
      loadMyApps();
      onClose();
    },
    successToast: t('common:update_success'),
    errorToast: t('common:update_failed')
  });

  useEffect(() => {
    (async () => {
      if (!apiSchemaStr) {
        return setApiData({ pathData: [], serverPath: '' });
      }
      try {
        setApiData(await str2OpenApiSchema(apiSchemaStr));
      } catch (err) {
        toast({
          status: 'warning',
          title: t('common:plugin.Invalid Schema')
        });
        setApiData({ pathData: [], serverPath: '' });
      }
    })();
  }, [apiSchemaStr, t, toast]);

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
        title={isEdit ? t('common:plugin.Edit Http Plugin') : t('common:plugin.Import Plugin')}
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
          {!isEdit ? (
            <Button
              isDisabled={!nameValue?.trim()}
              onClick={handleSubmit((data) => onCreate(data))}
              isLoading={isCreating}
            >
              {t('common:comfirn_create')}
            </Button>
          ) : (
            <Button
              isDisabled={apiData.pathData.length === 0}
              isLoading={isUpdating}
              onClick={handleSubmit((data) => updatePlugins(data))}
            >
              {t('common:confirm_update')}
            </Button>
          )}
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
