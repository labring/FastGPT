import React, { useCallback, useMemo, useState } from 'react';
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
  IconButton,
  useDisclosure
} from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@/web/common/hooks/useRequest';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import { useTranslation } from 'next-i18next';
import { CreateOnePluginParams } from '@fastgpt/global/core/plugin/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';
import {
  delOnePlugin,
  getApiSchemaByUrl,
  postCreatePlugin,
  putUpdatePlugin
} from '@/web/core/plugin/api';
import { str2OpenApiSchema } from '@fastgpt/global/core/plugin/httpPlugin/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { AddIcon } from '@chakra-ui/icons';
import MyModal from '@fastgpt/web/components/common/MyModal';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { EditFormType } from './type';

export const defaultHttpPlugin: CreateOnePluginParams = {
  avatar: '/imgs/module/http.png',
  name: '',
  intro: '',
  parentId: null,
  type: PluginTypeEnum.folder,
  modules: [],
  metadata: {
    apiSchemaStr: '',
    customHeaders: ''
  }
};

const HttpPluginEditModal = ({
  defaultPlugin = defaultHttpPlugin,
  onClose,
  onSuccess,
  onDelete
}: {
  defaultPlugin?: EditFormType;
  onClose: () => void;
  onSuccess: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEdit = !!defaultPlugin.id;

  const [refresh, setRefresh] = useState(false);

  const [schemaUrl, setSchemaUrl] = useState('');

  const { register, setValue, getValues, handleSubmit, watch } = useForm<CreateOnePluginParams>({
    defaultValues: defaultPlugin
  });
  const apiSchemaStr = watch('metadata.apiSchemaStr');
  const apiData = useMemo(() => {
    if (!apiSchemaStr) {
      return { pathData: [], serverPath: '' };
    }
    try {
      return str2OpenApiSchema(apiSchemaStr);
    } catch (err) {
      toast({
        status: 'warning',
        title: t('plugin.Invalid Schema')
      });
      return { pathData: [], serverPath: '' };
    }
  }, [apiSchemaStr, t, toast]);

  const {
    isOpen: isOpenUrlImport,
    onOpen: onOpenUrlImport,
    onClose: onCloseUrlImport
  } = useDisclosure();

  const { mutate: onCreate, isLoading: isCreating } = useRequest({
    mutationFn: async (data: CreateOnePluginParams) => {
      return postCreatePlugin(data);
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: t('common.Create Success'),
    errorToast: t('common.Create Failed')
  });

  const { mutate: updatePlugins, isLoading: isUpdating } = useRequest({
    mutationFn: async (data: EditFormType) => {
      if (!data.id) return Promise.resolve('');
      return putUpdatePlugin({
        id: data.id,
        name: data.name,
        avatar: data.avatar,
        intro: data.intro,
        metadata: data.metadata
      });
    },
    onSuccess() {
      onClose();
      onSuccess();
    },
    successToast: t('common.Update Success'),
    errorToast: t('common.Update Failed')
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    title: t('common.Delete Tip'),
    content: t('core.plugin.Delete http plugin')
  });

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.pluginAvatar,
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar', src);
        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common.Select File Failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  const { mutate: onclickDelPlugin, isLoading: isDeleting } = useRequest({
    mutationFn: async () => {
      if (!defaultPlugin.id) return;

      await delOnePlugin(defaultPlugin.id);
      onDelete();
      onClose();
    },
    successToast: t('common.Delete Success'),
    errorToast: t('common.Delete Failed')
  });

  /* load api from url */
  const { mutate: onClickUrlLoadApi, isLoading: isLoadingUrlApi } = useRequest({
    mutationFn: async () => {
      if (!schemaUrl || !schemaUrl.startsWith('https://')) {
        return toast({
          title: t('plugin.Invalid URL'),
          status: 'warning'
        });
      }

      const schema = await getApiSchemaByUrl(schemaUrl);
      setValue('metadata.apiSchemaStr', JSON.stringify(schema));

      onCloseUrlImport();
    },
    errorToast: t('plugin.Invalid Schema')
  });

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        iconSrc="/imgs/module/http.png"
        title={isEdit ? t('plugin.Edit Http Plugin') : t('plugin.Import Plugin')}
        w={['90vw', '600px']}
        h={['90vh', '80vh']}
        position={'relative'}
      >
        <ModalBody flex={'1 0 0'} overflow={'auto'}>
          <>
            <Box color={'myGray.800'} fontWeight={'bold'}>
              {t('plugin.Set Name')}
            </Box>
            <Flex mt={3} alignItems={'center'}>
              <MyTooltip label={t('common.Set Avatar')}>
                <Avatar
                  flexShrink={0}
                  src={getValues('avatar')}
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
                  required: t("common.Name Can't Be Empty")
                })}
              />
            </Flex>
          </>
          <>
            <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
              {t('plugin.Intro')}
            </Box>
            <Textarea {...register('intro')} bg={'myWhite.600'} rows={3} mt={3} />
          </>
          <Box mt={4}>
            <Box
              color={'myGray.800'}
              fontWeight={'bold'}
              justifyContent={'space-between'}
              display={'flex'}
            >
              <Box my={'auto'}>{'OpenAPI Schema'}</Box>

              <Box>
                {isOpenUrlImport ? (
                  <Flex alignItems={'center'}>
                    <Input
                      mr={2}
                      placeholder={'https://...'}
                      h={'30px'}
                      onBlur={(e) => setSchemaUrl(e.target.value)}
                    />
                    <Button size={'sm'} isLoading={isLoadingUrlApi} onClick={onClickUrlLoadApi}>
                      {t('common.Confirm')}
                    </Button>
                    <Button ml={2} variant={'whiteBase'} size={'sm'} onClick={onCloseUrlImport}>
                      {t('common.Cancel')}
                    </Button>
                  </Flex>
                ) : (
                  <Button
                    variant={'whiteBase'}
                    size={'sm'}
                    fontSize={'xs'}
                    leftIcon={<AddIcon fontSize={'xs'} />}
                    onClick={onOpenUrlImport}
                  >
                    {t('plugin.Import from URL')}
                  </Button>
                )}
              </Box>
            </Box>
            <Textarea
              {...register('metadata.apiSchemaStr')}
              bg={'myWhite.600'}
              rows={10}
              mt={3}
              onBlur={(e) => {
                const content = e.target.value;
                if (!content) return;
                setValue('metadata.apiSchemaStr', content);
              }}
            />
          </Box>
          <>
            <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
              {t('core.plugin.Custom headers')}
            </Box>
            <Box mt={1}>
              <JsonEditor
                defaultHeight={100}
                resize
                value={getValues('metadata.customHeaders')}
                onChange={(e) => {
                  setValue('metadata.customHeaders', e);
                }}
              />
            </Box>
          </>
          <>
            <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
              {t('plugin.Plugin List')}
            </Box>
            <TableContainer maxH={400} overflowY={'auto'} mt={3}>
              <Table border={'1px solid'} borderColor={'myGray.200'}>
                <Thead>
                  <Th>{t('Name')}</Th>
                  <Th>{t('plugin.Description')}</Th>
                  <Th>{t('plugin.Method')}</Th>
                  <Th>{t('plugin.Path')}</Th>
                </Thead>
                <Tbody>
                  {apiData?.pathData?.map((item, index) => (
                    <Tr key={index}>
                      <Td>{item.name}</Td>
                      <Td
                        fontSize={'sm'}
                        textColor={'gray.600'}
                        w={'auto'}
                        maxW={80}
                        whiteSpace={'pre-wrap'}
                      >
                        {item.description}
                      </Td>
                      <Td>{item.method}</Td>
                      <Td>{item.path}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </>
        </ModalBody>

        <Flex px={5} py={4} alignItems={'center'}>
          {isEdit && (
            <IconButton
              className="delete"
              size={'xsSquare'}
              icon={<MyIcon name={'delete'} w={'14px'} />}
              variant={'whiteDanger'}
              aria-label={'delete'}
              _hover={{
                bg: 'red.100'
              }}
              isLoading={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                openConfirm(onclickDelPlugin)();
              }}
            />
          )}
          <Box flex={1} />
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common.Close')}
          </Button>
          {!isEdit ? (
            <Button onClick={handleSubmit((data) => onCreate(data))} isLoading={isCreating}>
              {t('common.Confirm Create')}
            </Button>
          ) : (
            <Button
              isLoading={isUpdating}
              onClick={handleSubmit((data) => {
                const parentId = defaultPlugin.id as string;
                updatePlugins(data);
              })}
            >
              {t('common.Confirm Update')}
            </Button>
          )}
        </Flex>
      </MyModal>
      <File onSelect={onSelectFile} />
      <ConfirmModal />
    </>
  );
};

export default HttpPluginEditModal;
