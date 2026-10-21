import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
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
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getApiSchemaByUrl, putUpdateHttpTool } from '@/web/core/app/api/httpTools';
import { useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  isHttpToolInputAgentGenerated,
  pathData2ToolList,
  updateHttpToolInputProperty
} from '@fastgpt/global/core/app/tool/httpTool/utils';
import {
  getHttpToolSetConfigError,
  getNodeHttpToolListForSave
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/toolSetUtils';
import type { HttpToolSetRuntimeConfigType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import {
  headerValue2StoreHeader,
  storeHeader2HeaderValue
} from '@/components/common/secret/HeaderAuthConfig';
import HeaderAuthForm, { AuthValueDisplay } from '@/components/common/secret/HeaderAuthForm';
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

type CustomHeaderItem = {
  key: string;
  value: string;
  secretKey?: string;
  edited?: boolean;
};

const SchemaConfigModal = ({
  onClose,
  initialConfig,
  onSaveConfig
}: {
  onClose: () => void;
  initialConfig?: HttpToolSetRuntimeConfigType;
  onSaveConfig?: (config: HttpToolSetRuntimeConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [schemaUrl, setSchemaUrl] = useState<string>('');
  const [updateTrigger, setUpdateTrigger] = useState<boolean>(false);
  const [isExplicitApiSchemaImport, setIsExplicitApiSchemaImport] = useState(false);

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);

  const toolSetData = useMemo(() => {
    const toolSetNode = appDetail.nodes.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
    );
    return toolSetNode?.toolConfig?.httpToolSet;
  }, [appDetail.nodes]);

  const editableToolSetData = toolSetData && 'toolId' in toolSetData ? undefined : toolSetData;
  const currentConfig = initialConfig ?? editableToolSetData;
  const isWorkflowNodeConfig = Boolean(onSaveConfig);

  const { register, setValue, handleSubmit, watch } = useForm<HttpToolsType>({
    defaultValues: {
      avatar: '',
      name: appDetail?.name || '',
      intro: '',
      baseUrl: currentConfig?.baseUrl || '',
      apiSchemaStr: currentConfig?.apiSchemaStr || '',
      customHeaders:
        currentConfig?.customHeaders ||
        (isWorkflowNodeConfig ? '{}' : '{"Authorization":"Bearer"}'),
      headerSecret: currentConfig?.headerSecret || {}
    }
  });

  const [initialRequestHeaderKeys] = useState(() => {
    try {
      return Object.keys(JSON.parse(currentConfig?.customHeaders || '{}'));
    } catch {
      return [];
    }
  });
  const watchedCustomHeaders = watch('customHeaders');
  const [customHeaders, setCustomHeaders] = useState<CustomHeaderItem[]>(() => {
    try {
      const keyValue = JSON.parse(watchedCustomHeaders || '{}');
      return Object.keys(keyValue).map((key) => ({
        key,
        value: String(keyValue[key] ?? ''),
        secretKey: key
      }));
    } catch (error) {
      console.error('Error parsing custom headers', error);
      return [];
    }
  });
  const [editingHeaderIndex, setEditingHeaderIndex] = useState<number>();
  const headerSecret = watch('headerSecret');
  const apiSchemaStr = watch('apiSchemaStr');
  const requestHeaderKeys = new Set<string>(initialRequestHeaderKeys);
  customHeaders.forEach(({ key, value, secretKey, edited }) => {
    if (secretKey) requestHeaderKeys.add(secretKey);
    if (key && (secretKey || value || edited)) {
      requestHeaderKeys.add(key);
    }
  });
  const authHeaderSecret = Object.fromEntries(
    Object.entries(headerSecret ?? {}).filter(([key]) => !requestHeaderKeys.has(key))
  );
  const stringifyCustomHeaders = (headers: CustomHeaderItem[]) =>
    JSON.stringify(Object.fromEntries(headers.map(({ key, value }) => [key, value])), null, 2);

  const { runAsync: onClickUrlLoadApi, loading: isLoadingUrlApi } = useRequest(
    async () => {
      if (!schemaUrl || (!schemaUrl.startsWith('https://') && !schemaUrl.startsWith('http://'))) {
        return toast({
          title: t('common:plugin.Invalid URL'),
          status: 'warning'
        });
      }

      const schema = await getApiSchemaByUrl(schemaUrl);
      setValue('apiSchemaStr', JSON.stringify(schema, null, 2));
      setIsExplicitApiSchemaImport(true);
    },
    {
      manual: true,
      errorToast: t('common:plugin.Invalid Schema')
    }
  );
  const { runAsync: onUpdateHttpTool, loading: isUpdatingHttpTool } = useRequest(
    async (data: HttpToolsType) => {
      const requestHeaderSecret = customHeaders.reduce<StoreSecretValueType>(
        (result, { key, value, secretKey, edited }) => {
          if (!key) return result;
          if (value) {
            result[key] = { value, secret: '' };
          } else if (!edited && secretKey && data.headerSecret?.[secretKey]) {
            result[key] = data.headerSecret[secretKey];
          }
          return result;
        },
        {}
      );
      // Bearer/Basic 会映射为 Authorization，保留鉴权配置优先级。
      const nextHeaderSecret = {
        ...requestHeaderSecret,
        ...Object.fromEntries(
          Object.entries(data.headerSecret ?? {}).filter(([key]) => !requestHeaderKeys.has(key))
        )
      };
      const nextCustomHeaders = stringifyCustomHeaders(
        customHeaders.map(({ key }) => ({ key, value: '' }))
      );

      const apiData = await str2OpenApiSchema(data.apiSchemaStr || '');
      const toolList = await pathData2ToolList(apiData.pathData);
      const baseUrl = isWorkflowNodeConfig
        ? data.baseUrl?.trim() || apiData.serverPath
        : apiData.serverPath;

      if (onSaveConfig) {
        const previousToolByOperation = new Map(
          (initialConfig?.toolList ?? []).map((tool) => [
            `${tool.method.toUpperCase()} ${tool.path}`,
            tool
          ])
        );
        const importedToolList = toolList.map((tool) => {
          const previousTool = previousToolByOperation.get(
            `${tool.method.toUpperCase()} ${tool.path}`
          );
          if (!previousTool?.inputSchema?.properties || !tool.inputSchema?.properties) return tool;

          return {
            ...tool,
            inputSchema: {
              ...tool.inputSchema,
              properties: Object.fromEntries(
                Object.entries(tool.inputSchema.properties).map(([key, property]) => {
                  const previousProperty = previousTool.inputSchema?.properties?.[key];
                  return [
                    key,
                    previousProperty
                      ? updateHttpToolInputProperty({
                          key,
                          property,
                          enabled: isHttpToolInputAgentGenerated(previousProperty)
                        })
                      : property
                  ];
                })
              )
            }
          };
        });
        const toolListToSave = getNodeHttpToolListForSave({
          currentToolList: currentConfig?.toolList ?? [],
          importedToolList,
          currentApiSchemaStr: currentConfig?.apiSchemaStr ?? '',
          nextApiSchemaStr: data.apiSchemaStr || '',
          isExplicitImport: isExplicitApiSchemaImport
        });
        const configError = await getHttpToolSetConfigError({
          baseUrl,
          apiSchemaStr: data.apiSchemaStr || '',
          customHeaders: data.customHeaders || '{}',
          toolList: toolListToSave,
          allowToolSubset: true
        });
        if (configError) throw new Error(configError);

        onSaveConfig({
          baseUrl,
          apiSchemaStr: data.apiSchemaStr || '',
          customHeaders: nextCustomHeaders,
          headerSecret: nextHeaderSecret,
          toolList: toolListToSave.map(({ headerSecret: _headerSecret, ...tool }) => tool)
        });
        return;
      }

      return putUpdateHttpTool({
        appId: appDetail._id,
        baseUrl: apiData.serverPath,
        toolList,
        apiSchemaStr: data.apiSchemaStr || '',
        headerSecret: nextHeaderSecret,
        customHeaders: nextCustomHeaders
      });
    },
    {
      onSuccess: () => {
        toast({
          title: t('common:update_success'),
          status: 'success'
        });
        onClose();
        if (!onSaveConfig) reloadApp();
      },
      errorToast: t('common:plugin.Invalid Schema')
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
        {onSaveConfig && (
          <Box mb={4}>
            <Box mb={2} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
              {t('common:core.dataset.website.Base Url')}
            </Box>
            <Input {...register('baseUrl')} placeholder="https://api.example.com" fontSize={'sm'} />
          </Box>
        )}
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
            headerSecretValue={storeHeader2HeaderValue(authHeaderSecret)}
            onChange={(data) => {
              const requestSecrets = Object.fromEntries(
                Object.entries(headerSecret ?? {}).filter(([key]) => requestHeaderKeys.has(key))
              );
              setValue('headerSecret', { ...requestSecrets, ...headerValue2StoreHeader(data) });
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
          <FixedTableContainer flush>
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
                {customHeaders?.map((item, index) => {
                  const secretValue = headerSecret?.[item.secretKey ?? item.key];
                  const hasValue = item.edited
                    ? Boolean(item.value)
                    : Boolean(secretValue?.secret || secretValue?.value || item.value);

                  return (
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
                              const json = stringifyCustomHeaders(newHeaders);
                              setValue('customHeaders', json);
                              return newHeaders;
                            });
                          }}
                          updateTrigger={updateTrigger}
                        />
                      </Td>
                      <Td p={0}>
                        <Box display={'flex'} alignItems={'center'}>
                          <AuthValueDisplay
                            showInput={editingHeaderIndex === index || !hasValue}
                            index={index}
                            onEdit={setEditingHeaderIndex}
                            value={item.edited ? item.value : ''}
                            onChange={(value) =>
                              setCustomHeaders((prev) => {
                                const newHeaders = prev.map((h, i) =>
                                  i === index ? { ...h, value, edited: true } : h
                                );
                                setValue('customHeaders', stringifyCustomHeaders(newHeaders));
                                return newHeaders;
                              })
                            }
                            bg="myWhite.600"
                          />
                          <MyIcon
                            name={'delete'}
                            cursor={'pointer'}
                            _hover={{ color: 'red.600' }}
                            w={'14px'}
                            onClick={() =>
                              setCustomHeaders((prev) => {
                                const newHeaders = prev.filter((h) => h.key !== item.key);
                                const json = stringifyCustomHeaders(newHeaders);
                                setValue('customHeaders', json);
                                return newHeaders;
                              })
                            }
                          />
                        </Box>
                      </Td>
                    </Tr>
                  );
                })}
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
                          const json = stringifyCustomHeaders(newHeaders);
                          setValue('customHeaders', json);
                          return newHeaders;
                        });
                        setUpdateTrigger((prev) => !prev);
                      }}
                    />
                  </Td>
                  <Td p={0}>
                    <Box
                      minH={10}
                      px={2}
                      py={3}
                      color={'myGray.500'}
                      fontSize={'xs'}
                      userSelect={'none'}
                    >
                      {t('common:core.module.http.Add_props_value')}
                    </Box>
                  </Td>
                </Tr>
              </Tbody>
            </Table>
          </FixedTableContainer>
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
