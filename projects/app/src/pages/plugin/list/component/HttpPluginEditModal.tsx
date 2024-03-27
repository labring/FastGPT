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
  IconButton
} from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { EditFormType } from './type';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import { HttpHeaders } from '@/components/core/module/Flow/components/nodes/NodeHttp';
import { OpenApiJsonSchema } from '@fastgpt/global/core/plugin/httpPlugin/type';

export const defaultHttpPlugin: CreateOnePluginParams = {
  avatar: FolderImgUrl,
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
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>(() => {
    const keyValue = JSON.parse(defaultPlugin.metadata?.customHeaders || '{}');
    return Object.keys(keyValue).map((key) => ({ key, value: keyValue[key] }));
  });
  const [updateTrigger, setUpdateTrigger] = useState(false);

  const { register, setValue, getValues, handleSubmit, watch } = useForm<CreateOnePluginParams>({
    defaultValues: defaultPlugin
  });
  const apiSchemaStr = watch('metadata.apiSchemaStr');
  const [apiData, setApiData] = useState<OpenApiJsonSchema>({ pathData: [], serverPath: '' });

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
      setValue('metadata.apiSchemaStr', JSON.stringify(schema, null, 2));
    },
    errorToast: t('plugin.Invalid Schema')
  });

  const leftVariables = useMemo(
    () =>
      HttpHeaders.filter((variable) => {
        const existVariables = customHeaders.map((item) => item.key);
        return !existVariables.includes(variable.key);
      }),
    [customHeaders]
  );

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
          title: t('plugin.Invalid Schema')
        });
        setApiData({ pathData: [], serverPath: '' });
      }
    })();
  }, [apiSchemaStr, t, toast]);

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
            <Textarea
              {...register('intro')}
              bg={'myWhite.600'}
              rows={3}
              mt={3}
              placeholder={t('core.plugin.Http plugin intro placeholder')}
            />
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
                <Flex alignItems={'center'}>
                  <Input
                    mr={2}
                    placeholder={t('plugin.Import from URL')}
                    h={'30px'}
                    w={['150px', '250px']}
                    fontSize={'sm'}
                    onBlur={(e) => setSchemaUrl(e.target.value)}
                  />
                  <Button
                    size={'sm'}
                    variant={'whitePrimary'}
                    isLoading={isLoadingUrlApi}
                    onClick={onClickUrlLoadApi}
                  >
                    {t('common.Import')}
                  </Button>
                </Flex>
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
              <TableContainer overflowY={'visible'} overflowX={'unset'}>
                <Table>
                  <Thead>
                    <Tr>
                      <Th px={2}>{t('core.module.http.Props name')}</Th>
                      <Th px={2}>{t('core.module.http.Props value')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {customHeaders.map((item, index) => (
                      <Tr key={`${index}`}>
                        <Td p={0} w={'150px'}>
                          <HttpInput
                            hasVariablePlugin={false}
                            hasDropDownPlugin={true}
                            setDropdownValue={(val) => {
                              setCustomHeaders((prev) => {
                                const newHeaders = prev.map((item, i) =>
                                  i === index ? { ...item, key: val } : item
                                );
                                setValue(
                                  'metadata.customHeaders',
                                  '{\n' +
                                    newHeaders
                                      .map((item) => `"${item.key}":"${item.value}"`)
                                      .join(',\n') +
                                    '\n}'
                                );
                                return newHeaders;
                              });
                              setUpdateTrigger((prev) => !prev);
                            }}
                            placeholder={t('core.module.http.Props name')}
                            value={item.key}
                            variables={leftVariables}
                            onBlur={(val) => {
                              setCustomHeaders((prev) => {
                                const newHeaders = prev.map((item, i) =>
                                  i === index ? { ...item, key: val } : item
                                );
                                setValue(
                                  'metadata.customHeaders',
                                  '{\n' +
                                    newHeaders
                                      .map((item) => `"${item.key}":"${item.value}"`)
                                      .join(',\n') +
                                    '\n}'
                                );
                                return newHeaders;
                              });
                            }}
                            updateTrigger={updateTrigger}
                          />
                        </Td>
                        <Td p={0}>
                          <Box display={'flex'} alignItems={'center'}>
                            <HttpInput
                              placeholder={t('core.module.http.Props value')}
                              hasVariablePlugin={false}
                              value={item.value}
                              onBlur={(val) =>
                                setCustomHeaders((prev) => {
                                  const newHeaders = prev.map((item, i) =>
                                    i === index ? { ...item, value: val } : item
                                  );
                                  setValue(
                                    'metadata.customHeaders',
                                    '{\n' +
                                      newHeaders
                                        .map((item) => `"${item.key}":"${item.value}"`)
                                        .join(',\n') +
                                      '\n}'
                                  );
                                  return newHeaders;
                                })
                              }
                            />
                            <MyIcon
                              name={'delete'}
                              cursor={'pointer'}
                              _hover={{ color: 'red.600' }}
                              w={'14px'}
                              onClick={() =>
                                setCustomHeaders((prev) => {
                                  const newHeaders = prev.filter((val) => val.key !== item.key);
                                  setValue(
                                    'metadata.customHeaders',
                                    '{\n' +
                                      newHeaders
                                        .map((item) => `"${item.key}":"${item.value}"`)
                                        .join(',\n') +
                                      '\n}'
                                  );
                                  return newHeaders;
                                })
                              }
                            />
                          </Box>
                        </Td>
                      </Tr>
                    ))}
                    <Tr>
                      <Td p={0} w={'150px'}>
                        <HttpInput
                          hasVariablePlugin={false}
                          hasDropDownPlugin={true}
                          setDropdownValue={(val) => {
                            setCustomHeaders((prev) => {
                              const newHeaders = [...prev, { key: val, value: '' }];
                              setValue(
                                'metadata.customHeaders',
                                '{\n' +
                                  newHeaders
                                    .map((item) => `"${item.key}":"${item.value}"`)
                                    .join(',\n') +
                                  '\n}'
                              );
                              return newHeaders;
                            });
                            setUpdateTrigger((prev) => !prev);
                          }}
                          placeholder={t('core.module.http.Add props')}
                          value={''}
                          variables={leftVariables}
                          updateTrigger={updateTrigger}
                          onBlur={(val) => {
                            if (!val) return;
                            setCustomHeaders((prev) => {
                              const newHeaders = [...prev, { key: val, value: '' }];
                              setValue(
                                'metadata.customHeaders',
                                '{\n' +
                                  newHeaders
                                    .map((item) => `"${item.key}":"${item.value}"`)
                                    .join(',\n') +
                                  '\n}'
                              );
                              return newHeaders;
                            });
                            setUpdateTrigger((prev) => !prev);
                          }}
                        />
                      </Td>
                      <Td p={0}>
                        <Box display={'flex'} alignItems={'center'}>
                          <HttpInput />
                        </Box>
                      </Td>
                    </Tr>
                  </Tbody>
                </Table>
              </TableContainer>
            </Box>
          </>
          <>
            <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
              {t('plugin.Plugin List')}
            </Box>
            <Box
              mt={3}
              borderRadius={'md'}
              overflow={'hidden'}
              borderWidth={'1px'}
              borderBottom="none"
            >
              <TableContainer maxH={400} overflowY={'auto'}>
                <Table bg={'white'}>
                  <Thead bg={'myGray.50'}>
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
            </Box>
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
            <Button isLoading={isUpdating} onClick={handleSubmit((data) => updatePlugins(data))}>
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
