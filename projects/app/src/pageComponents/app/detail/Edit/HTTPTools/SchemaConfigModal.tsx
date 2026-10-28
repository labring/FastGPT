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
import { pathData2ToolList } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import {
  headerValue2StoreHeader,
  storeHeader2HeaderValue
} from '@/components/common/secret/HeaderAuthConfig';
import HeaderAuthForm, { AuthValueDisplay } from '@/components/common/secret/HeaderAuthForm';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import {
  HttpToolSetRuntimeConfigSchema,
  type HttpToolSetNodeConfigType
} from '@fastgpt/global/core/workflow/type/node';
import { buildWorkflowCustomHeaders, type CustomHeaderItem } from './utils';

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

const SchemaConfigModal = ({
  onClose,
  initialConfig,
  onSaveConfig
}: {
  onClose: () => void;
  initialConfig?: HttpToolSetNodeConfigType;
  onSaveConfig?: (config: HttpToolSetNodeConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [schemaUrl, setSchemaUrl] = useState<string>('');
  const [apiSchemaUrl, setApiSchemaUrl] = useState(initialConfig?.apiSchemaUrl ?? '');
  const [toolList, setToolList] = useState(initialConfig?.toolList ?? []);
  const [workflowApiSchemaStr, setWorkflowApiSchemaStr] = useState('');
  const [updateTrigger, setUpdateTrigger] = useState<boolean>(false);
  const isWorkflowNodeConfig = Boolean(onSaveConfig);

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);

  const toolSetData = useMemo(() => {
    const toolSetNode = appDetail.nodes.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
    );
    return toolSetNode?.toolConfig?.httpToolSet;
  }, [appDetail.nodes]);

  const editableToolSetData =
    toolSetData && !('toolId' in toolSetData)
      ? HttpToolSetRuntimeConfigSchema.safeParse(toolSetData).data
      : undefined;
  const editableApiSchemaStr =
    editableToolSetData && 'apiSchemaStr' in editableToolSetData
      ? editableToolSetData.apiSchemaStr
      : undefined;

  const { register, setValue, handleSubmit, watch } = useForm<HttpToolsType>({
    defaultValues: {
      avatar: '',
      name: appDetail?.name || '',
      intro: '',
      baseUrl: initialConfig?.baseUrl ?? editableToolSetData?.baseUrl ?? '',
      apiSchemaStr: editableApiSchemaStr || '',
      customHeaders: initialConfig
        ? (initialConfig.customHeaders ?? '{}')
        : editableToolSetData?.customHeaders || '{"Authorization":"Bearer"}',
      headerSecret: initialConfig?.headerSecret ?? editableToolSetData?.headerSecret ?? {}
    }
  });

  const watchedCustomHeaders = watch('customHeaders');
  const [initialRequestHeaderKeys] = useState(() => {
    try {
      return Object.keys(JSON.parse(watchedCustomHeaders || '{}'));
    } catch {
      return [];
    }
  });
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
  const headerSecret = watch('headerSecret') ?? {};
  const apiSchemaStr = watch('apiSchemaStr');
  const requestHeaderKeys = new Set(initialRequestHeaderKeys);
  customHeaders.forEach(({ key, secretKey }) => {
    if (secretKey) requestHeaderKeys.add(secretKey);
    if (key) requestHeaderKeys.add(key);
  });
  const authHeaderSecret = isWorkflowNodeConfig
    ? Object.fromEntries(
        Object.entries(headerSecret).filter(([key]) => !requestHeaderKeys.has(key))
      )
    : headerSecret;
  const stringifyCustomHeaders = (headers: CustomHeaderItem[]) =>
    JSON.stringify(
      Object.fromEntries(
        headers
          .filter(({ key }) => key)
          .map(({ key, value }) => [key, isWorkflowNodeConfig ? '' : value])
      ),
      null,
      2
    );

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
    },
    {
      manual: true,
      errorToast: t('common:plugin.Invalid Schema')
    }
  );
  // workflow 节点只在用户手动刷新时读取远端定义，并将其压成工具摘要。
  const { runAsync: onRefreshWorkflowTools, loading: isRefreshingWorkflowTools } = useRequest(
    async (url: string) => {
      const schema = await getApiSchemaByUrl(url);
      const schemaStr = JSON.stringify(schema, null, 2);
      const { pathData } = await str2OpenApiSchema(schemaStr);
      const tools = await pathData2ToolList(pathData);
      setWorkflowApiSchemaStr(schemaStr);
      return tools;
    },
    {
      manual: true,
      onSuccess: (tools) => {
        const savedDescriptions = new Map(toolList.map((tool) => [tool.name, tool.description]));
        setToolList(
          tools.map(({ name, description }) => ({
            name,
            description: savedDescriptions.has(name)
              ? (savedDescriptions.get(name) ?? '')
              : (description ?? '')
          }))
        );
      },
      errorToast: t('common:plugin.Invalid Schema')
    }
  );
  const { runAsync: onUpdateHttpTool, loading: isUpdatingHttpTool } = useRequest(
    async (data: HttpToolsType) => {
      const apiData = await str2OpenApiSchema(data.apiSchemaStr || '');
      const toolList = await pathData2ToolList(apiData.pathData);

      return putUpdateHttpTool({
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

  const onClickWorkflowRefresh = () => {
    const url = apiSchemaUrl.trim();
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      toast({ title: t('common:plugin.Invalid URL'), status: 'warning' });
      return;
    }
    onRefreshWorkflowTools(url);
  };

  /** workflow 节点保存远端定义地址和本地请求配置；OpenAPI 正文仍在执行期动态读取。 */
  const onSaveWorkflowConfig = (data: HttpToolsType) => {
    const url = apiSchemaUrl.trim();
    const baseUrl = data.baseUrl?.trim();
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      toast({ title: t('common:plugin.Invalid URL'), status: 'warning' });
      return;
    }

    const customHeadersStr = data.customHeaders || '{}';
    try {
      const headers: unknown = JSON.parse(customHeadersStr);
      if (
        !headers ||
        typeof headers !== 'object' ||
        Array.isArray(headers) ||
        Object.values(headers).some((value) => typeof value !== 'string')
      ) {
        throw new Error('Invalid headers');
      }
    } catch {
      toast({ title: t('common:plugin.Invalid Schema'), status: 'warning' });
      return;
    }

    const requestHeaderConfig = buildWorkflowCustomHeaders({
      headers: customHeaders,
      storedSecrets: data.headerSecret ?? {}
    });
    const authHeaderSecrets = Object.fromEntries(
      Object.entries(data.headerSecret ?? {}).filter(([key]) => !requestHeaderKeys.has(key))
    );

    onSaveConfig?.({
      apiSchemaUrl: url,
      ...(baseUrl ? { baseUrl } : {}),
      customHeaders: requestHeaderConfig.customHeaders,
      headerSecret: { ...requestHeaderConfig.headerSecret, ...authHeaderSecrets },
      toolList
    });
    onClose();
  };

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc={'common/setting'}
      iconColor={'primary.600'}
      title={t(isWorkflowNodeConfig ? 'app:toolset_config' : 'app:Params_config')}
      w={600}
    >
      <ModalBody px={9}>
        {isWorkflowNodeConfig ? (
          <>
            <Box mt={2}>
              <Flex mb={2} alignItems={'center'} justifyContent={'space-between'}>
                <Box color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
                  OpenAPI Schema URL
                </Box>
                <Button
                  size={'sm'}
                  variant={'whitePrimary'}
                  isLoading={isRefreshingWorkflowTools}
                  onClick={onClickWorkflowRefresh}
                >
                  {t('common:Parse')}
                </Button>
              </Flex>
              <Input
                className="nodrag"
                value={apiSchemaUrl}
                placeholder={t('common:plugin.Import from URL')}
                onChange={(event) => {
                  setApiSchemaUrl(event.target.value);
                  setWorkflowApiSchemaStr('');
                }}
              />
            </Box>
            <Box mt={4}>
              <Box mb={2} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
                {t('common:support.openapi.Api baseurl')}
              </Box>
              <Input
                {...register('baseUrl')}
                className="nodrag"
                aria-label={t('common:support.openapi.Api baseurl')}
              />
            </Box>
            {workflowApiSchemaStr && (
              <Box mt={4}>
                <Box mb={2} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
                  OpenAPI Schema
                </Box>
                <Textarea
                  className="nodrag"
                  value={workflowApiSchemaStr}
                  isReadOnly
                  bg={'myWhite.600'}
                  rows={10}
                  minH={40}
                />
              </Box>
            )}
          </>
        ) : (
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
        )}

        <Box mt={6} mb={2} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
          {t('common:auth_config')}
        </Box>
        <Box mt={2}>
          <HeaderAuthForm
            headerSecretValue={storeHeader2HeaderValue(authHeaderSecret)}
            onChange={(data) => {
              const requestHeaderSecrets = isWorkflowNodeConfig
                ? Object.fromEntries(
                    Object.entries(headerSecret).filter(([key]) => requestHeaderKeys.has(key))
                  )
                : {};
              setValue('headerSecret', {
                ...requestHeaderSecrets,
                ...headerValue2StoreHeader(data)
              });
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
                  const storedValue = headerSecret[item.secretKey ?? item.key];
                  const hasValue = item.edited
                    ? Boolean(item.value)
                    : Boolean(storedValue?.secret || storedValue?.value || item.value);

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
                              setValue('customHeaders', stringifyCustomHeaders(newHeaders));
                              return newHeaders;
                            });
                          }}
                          updateTrigger={updateTrigger}
                        />
                      </Td>
                      <Td p={0}>
                        <Box display={'flex'} alignItems={'center'}>
                          {isWorkflowNodeConfig ? (
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
                          ) : (
                            <HttpInput
                              placeholder={t('common:core.module.http.Props value')}
                              value={item.value}
                              onBlur={(val) =>
                                setCustomHeaders((prev) => {
                                  const newHeaders = prev.map((h, i) =>
                                    i === index ? { ...h, value: val } : h
                                  );
                                  setValue('customHeaders', stringifyCustomHeaders(newHeaders));
                                  return newHeaders;
                                })
                              }
                            />
                          )}
                          <MyIcon
                            name={'delete'}
                            cursor={'pointer'}
                            _hover={{ color: 'red.600' }}
                            w={'14px'}
                            onClick={() =>
                              setCustomHeaders((prev) => {
                                const newHeaders = prev.filter((h) => h.key !== item.key);
                                setValue('customHeaders', stringifyCustomHeaders(newHeaders));
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
                          setValue('customHeaders', stringifyCustomHeaders(newHeaders));
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
          </FixedTableContainer>
        </Box>
      </ModalBody>

      <ModalFooter px={9} display={'flex'} flexDirection={'column'}>
        <Box display={'flex'} justifyContent={'end'} w={'full'} gap={3}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            isDisabled={isWorkflowNodeConfig ? !apiSchemaUrl.trim() : !apiSchemaStr}
            onClick={handleSubmit((data) =>
              isWorkflowNodeConfig ? onSaveWorkflowConfig(data) : onUpdateHttpTool(data)
            )}
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
