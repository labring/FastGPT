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
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { HttpPluginImgUrl, MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import {
  postCreateHttpPlugin,
  putUpdateHttpPlugin,
  getApiSchemaByUrl
} from '@/web/core/app/api/plugin';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/httpPlugin/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import { OpenApiJsonSchema } from '@fastgpt/global/core/app/httpPlugin/type';
import { AppSchema } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';

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

  const { register, setValue, handleSubmit, watch } = useForm<EditHttpPluginProps>({
    defaultValues: defaultPlugin
  });
  const avatar = watch('avatar');
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
          apiSchemaStr: data.pluginData?.apiSchemaStr,
          customHeaders: data.pluginData?.customHeaders
        }
      });
    },
    onSuccess() {
      loadMyApps();
      onClose();
    },
    successToast: t('common:common.Create Success'),
    errorToast: t('common:common.Create Failed')
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
    successToast: t('common:common.Update Success'),
    errorToast: t('common:common.Update Failed')
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
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common:common.Select File Failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  /* load api from url */
  const { mutate: onClickUrlLoadApi, isLoading: isLoadingUrlApi } = useRequest({
    mutationFn: async () => {
      if (!schemaUrl || (!schemaUrl.startsWith('https://') && !schemaUrl.startsWith('http://'))) {
        return toast({
          title: t('common:plugin.Invalid URL'),
          status: 'warning'
        });
      }

      const schema = await getApiSchemaByUrl(schemaUrl);
      setValue('pluginData.apiSchemaStr', JSON.stringify(schema, null, 2));
    },
    errorToast: t('common:plugin.Invalid Schema')
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

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        iconSrc="core/app/type/httpPluginFill"
        title={isEdit ? t('common:plugin.Edit Http Plugin') : t('common:plugin.Import Plugin')}
        w={['90vw', '600px']}
        h={['90vh', '80vh']}
        position={'relative'}
      >
        <ModalBody flex={'1 0 0'} overflow={'auto'}>
          <>
            <Box color={'myGray.800'} fontWeight={'bold'}>
              {t('common:plugin.Set Name')}
            </Box>
            <Flex mt={3} alignItems={'center'}>
              <MyTooltip label={t('common:common.Set Avatar')}>
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
                  required: t('common:common.name_is_empty')
                })}
              />
            </Flex>
            <>
              <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
                {t('common:plugin.Intro')}
              </Box>
              <Textarea
                {...register('intro')}
                bg={'myWhite.600'}
                rows={3}
                mt={3}
                placeholder={t('common:core.plugin.Http plugin intro placeholder')}
              />
            </>
          </>
          {/* import */}
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
                    placeholder={t('common:plugin.Import from URL')}
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
                    {t('common:common.Import')}
                  </Button>
                </Flex>
              </Box>
            </Box>
            <Textarea
              {...register('pluginData.apiSchemaStr')}
              bg={'myWhite.600'}
              rows={10}
              mt={3}
              onBlur={(e) => {
                const content = e.target.value;
                if (!content) return;
                setValue('pluginData.apiSchemaStr', content);
              }}
            />
          </Box>
          <>
            <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
              {t('common:core.plugin.Custom headers')}
            </Box>
            <Box
              mt={1}
              borderRadius={'md'}
              overflow={'hidden'}
              borderWidth={'1px'}
              borderBottom={'none'}
            >
              <TableContainer overflowY={'visible'} overflowX={'unset'}>
                <Table>
                  <Thead>
                    <Tr>
                      <Th px={2} borderRadius="none !important">
                        {t('common:core.module.http.Props name')}
                      </Th>
                      <Th px={2} borderRadius="none !important">
                        {t('common:core.module.http.Props value')}
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {customHeaders.map((item, index) => (
                      <Tr key={`${index}`}>
                        <Td p={0} w={'150px'}>
                          <HttpInput
                            placeholder={t('common:core.module.http.Props name')}
                            value={item.key}
                            onBlur={(val) => {
                              setCustomHeaders((prev) => {
                                const newHeaders = prev.map((item, i) =>
                                  i === index ? { ...item, key: val } : item
                                );
                                setValue(
                                  'pluginData.customHeaders',
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
                              placeholder={t('common:core.module.http.Props value')}
                              value={item.value}
                              onBlur={(val) =>
                                setCustomHeaders((prev) => {
                                  const newHeaders = prev.map((item, i) =>
                                    i === index ? { ...item, value: val } : item
                                  );
                                  setValue(
                                    'pluginData.customHeaders',
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
                                    'pluginData.customHeaders',
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
                          placeholder={t('common:core.module.http.Add props')}
                          value={''}
                          updateTrigger={updateTrigger}
                          onBlur={(val) => {
                            if (!val) return;
                            setCustomHeaders((prev) => {
                              const newHeaders = [...prev, { key: val, value: '' }];
                              setValue(
                                'pluginData.customHeaders',
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
              {t('common:plugin.Plugin List')}
            </Box>
            <Box
              mt={3}
              borderRadius={'md'}
              overflow={'hidden'}
              borderWidth={'1px'}
              borderBottom={'none'}
            >
              <TableContainer maxH={400} overflowY={'auto'}>
                <Table bg={'white'}>
                  <Thead bg={'myGray.50'}>
                    <Th>{t('common:Name')}</Th>
                    <Th>{t('common:plugin.Description')}</Th>
                    <Th>{t('common:plugin.Method')}</Th>
                    <Th>{t('common:plugin.Path')}</Th>
                  </Thead>
                  <Tbody>
                    {apiData.pathData?.map((item, index) => (
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

        <ModalFooter>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common:common.Close')}
          </Button>
          {!isEdit ? (
            <Button
              isDisabled={apiData.pathData.length === 0}
              onClick={handleSubmit((data) => onCreate(data))}
              isLoading={isCreating}
            >
              {t('common:common.Confirm Create')}
            </Button>
          ) : (
            <Button
              isDisabled={apiData.pathData.length === 0}
              isLoading={isUpdating}
              onClick={handleSubmit((data) => updatePlugins(data))}
            >
              {t('common:common.Confirm Update')}
            </Button>
          )}
        </ModalFooter>
      </MyModal>
      <File onSelect={onSelectFile} />
    </>
  );
};

export default HttpPluginEditModal;
