import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getApiSchemaByUrl, putUpdateHttpPlugin } from '@/web/core/app/api/tool';
import { useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { pathData2ToolList } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import {
  headerValue2StoreHeader,
  storeHeader2HeaderValue
} from '@/components/common/secret/HeaderAuthConfig';
import HeaderAuthForm from '@/components/common/secret/HeaderAuthForm';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';

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

const SchemaConfigModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [schemaUrl, setSchemaUrl] = useState<string>('');
  const [updateTrigger, setUpdateTrigger] = useState<boolean>(false);

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);

  const toolSetData = useMemo(() => {
    const toolSetNode = appDetail.modules.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
    );
    return toolSetNode?.toolConfig?.httpToolSet;
  }, [appDetail.modules]);

  const { register, setValue, handleSubmit, watch } = useForm<HttpToolsType>({
    defaultValues: {
      avatar: '',
      name: appDetail?.name || '',
      intro: '',
      baseUrl: toolSetData?.baseUrl || '',
      apiSchemaStr: toolSetData?.apiSchemaStr || '',
      customHeaders: toolSetData?.customHeaders || '{"Authorization":"Bearer"}',
      headerSecret: toolSetData?.headerSecret || {}
    }
  });

  const watchedCustomHeaders = watch('customHeaders');
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>(() => {
    try {
      const keyValue = JSON.parse(watchedCustomHeaders || '{}');
      return Object.keys(keyValue).map((key) => ({ key, value: keyValue[key] }));
    } catch (error) {
      console.error('Error parsing custom headers', error);
      return [];
    }
  });
  const headerSecret = watch('headerSecret');
  const apiSchemaStr = watch('apiSchemaStr');

  const { runAsync: onClickUrlLoadApi, loading: isLoadingUrlApi } = useRequest2(
    async () => {
      if (!schemaUrl || (!schemaUrl.startsWith('https://') && !schemaUrl.startsWith('http://'))) {
        return toast({
          title: t('common:plugin.Invalid URL'),
          status: 'warning'
        });
      }

      const schema = await getApiSchemaByUrl(schemaUrl);
      setValue('apiSchemaStr', JSON.stringify(schema, null, 2));
    },
    {
      manual: true,
      errorToast: t('common:plugin.Invalid Schema')
    }
  );
  const { runAsync: onUpdateHttpTool, loading: isUpdatingHttpTool } = useRequest2(
    async (data: HttpToolsType) => {
      const apiData = await str2OpenApiSchema(data.apiSchemaStr || '');
      const toolList = await pathData2ToolList(apiData.pathData);

      return putUpdateHttpPlugin({
        appId: appDetail._id,
        baseUrl: apiData.serverPath,
        toolList,
        apiSchemaStr: data.apiSchemaStr || '',
        headerSecret: data.headerSecret || {},
        customHeaders: data.customHeaders || '{}'
      });
    },
    {
      onSuccess: () => {
        toast({
          title: t('common:update_success'),
          status: 'success'
        });
        onClose();
        reloadApp();
      }
    }
  );

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc={'common/setting'}
      iconColor={'primary.600'}
      title={t('app:Params_config')}
      w={600}
    >
      <ModalBody px={9}>
        <Box mt={2}>
          <Box
            color={'myGray.800'}
            fontWeight={'bold'}
            justifyContent={'space-between'}
            display={'flex'}
          >
            <Box my={'auto'} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
              OpenAPI Schema
            </Box>

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
                  {t('common:Import')}
                </Button>
              </Flex>
            </Box>
          </Box>
          <Textarea
            {...register('apiSchemaStr', {
              required: true
            })}
            bg={'myWhite.600'}
            rows={10}
            minH={40}
            mt={3}
          />
        </Box>

        <Box mt={6} mb={2} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
          {t('common:auth_config')}
        </Box>
        <Box mt={2}>
          <HeaderAuthForm
            headerSecretValue={storeHeader2HeaderValue(headerSecret)}
            onChange={(data) => {
              const storeData = headerValue2StoreHeader(data);
              setValue('headerSecret', storeData);
            }}
            fontWeight="normal"
          />
        </Box>

        <Box mt={6} mb={2} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
          {t('app:request_headers')}
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
                {customHeaders?.map((item, index) => (
                  <Tr key={`${index}`}>
                    <Td p={0} w={'150px'}>
                      <HttpInput
                        placeholder={t('common:core.module.http.Props name')}
                        value={item.key}
                        onBlur={(val) => {
                          setCustomHeaders((prev) => {
                            const newHeaders = prev.map((h, i) =>
                              i === index ? { ...h, key: val } : h
                            );
                            const json =
                              '{\n' +
                              newHeaders.map((h) => `"${h.key}":"${h.value}"`).join(',\n') +
                              '\n}';
                            setValue('customHeaders', json);
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
                              const newHeaders = prev.map((h, i) =>
                                i === index ? { ...h, value: val } : h
                              );
                              const json =
                                '{\n' +
                                newHeaders.map((h) => `"${h.key}":"${h.value}"`).join(',\n') +
                                '\n}';
                              setValue('customHeaders', json);
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
                              const newHeaders = prev.filter((h) => h.key !== item.key);
                              const json =
                                '{\n' +
                                newHeaders.map((h) => `"${h.key}":"${h.value}"`).join(',\n') +
                                '\n}';
                              setValue('customHeaders', json);
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
                          const json =
                            '{\n' +
                            newHeaders.map((h) => `"${h.key}":"${h.value}"`).join(',\n') +
                            '\n}';
                          setValue('customHeaders', json);
                          return newHeaders;
                        });
                        setUpdateTrigger((prev) => !prev);
                      }}
                    />
                  </Td>
                  <Td p={0}>
                    <Box display={'flex'} alignItems={'center'}>
                      <HttpInput placeholder={t('common:core.module.http.Add_props_value')} />
                    </Box>
                  </Td>
                </Tr>
              </Tbody>
            </Table>
          </TableContainer>
        </Box>
      </ModalBody>

      <ModalFooter px={9} display={'flex'} flexDirection={'column'}>
        <Box display={'flex'} justifyContent={'end'} w={'full'} gap={3}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            isDisabled={!apiSchemaStr}
            onClick={handleSubmit((data) => onUpdateHttpTool(data))}
            isLoading={isUpdatingHttpTool}
          >
            {t('common:Save')}
          </Button>
        </Box>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(SchemaConfigModal);
