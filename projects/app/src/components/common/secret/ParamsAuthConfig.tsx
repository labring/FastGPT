import type { ButtonProps } from '@chakra-ui/react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  IconButton,
  Input,
  ModalBody,
  ModalFooter,
  Textarea,
  useDisclosure,
  TableContainer,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  Switch
} from '@chakra-ui/react';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import type { SecretValueType, StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import React, { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { putUpdateHttpPlugin, getApiSchemaByUrl } from '@/web/core/app/api/plugin';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/httpPlugin/utils';
import { type OpenApiJsonSchema } from '@fastgpt/global/core/app/httpPlugin/type';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useContextSelector } from 'use-context-selector';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';

export type EditHttpToolSetProps = {
  id?: string;
  avatar: string;
  name: string;
  intro?: string;
  pluginData?: AppSchema['pluginData'];
};

type OnSavedPayload = { url: string; toolList: HttpToolConfigType[] };

type HeaderSecretConfigType = {
  Bearer?: SecretValueType;
  Basic?: SecretValueType;
  customs?: {
    key: string;
    value: SecretValueType;
  }[];
};

const getShowInput = ({
  secretValue,
  editingIndex,
  index
}: {
  secretValue?: SecretValueType;
  editingIndex?: number;
  index: number;
}) => {
  const hasSecret = !!secretValue?.secret;
  const hasValue = !!secretValue?.value;
  const isEditing = editingIndex === index;

  return !hasSecret || hasValue || isEditing;
};

const AuthValueDisplay = ({
  showInput,
  fieldName,
  index = 0,
  onEdit,
  register
}: {
  showInput: boolean;
  fieldName: string;
  index?: number;
  onEdit: (index?: number) => void;
  register: UseFormRegister<HeaderSecretConfigType>;
}) => {
  const { t } = useTranslation();

  return (
    <Flex>
      {showInput ? (
        <FormControl flex={1}>
          <Input
            placeholder={'Value'}
            bg={'myGray.50'}
            h={8}
            maxLength={200}
            {...register(fieldName as any, {
              required: true
            })}
            onFocus={() => onEdit(index)}
            onBlur={() => onEdit(undefined)}
          />
        </FormControl>
      ) : (
        <Flex
          flex={1}
          borderRadius={'6px'}
          border={'0.5px solid'}
          borderColor={'primary.200'}
          bg={'primary.50'}
          h={8}
          px={3}
          alignItems={'center'}
          gap={1}
        >
          <MyIcon name="checkCircle" w={'16px'} color={'primary.600'} />
          <Box fontSize={'sm'} fontWeight={'medium'} color={'primary.600'}>
            {t('common:had_auth_value')}
          </Box>
        </Flex>
      )}
      {!showInput && (
        <IconButton
          aria-label="Edit header"
          icon={<MyIcon name="edit" w={'16px'} />}
          size="sm"
          variant="ghost"
          color={'myGray.500'}
          _hover={{ color: 'primary.600' }}
          onClick={() => onEdit(index)}
        />
      )}
    </Flex>
  );
};

const getSecretType = (config: HeaderSecretConfigType): HeaderSecretTypeEnum => {
  if (config.Bearer) {
    return HeaderSecretTypeEnum.Bearer;
  } else if (config.Basic) {
    return HeaderSecretTypeEnum.Basic;
  } else if (config.customs && config.customs.length > 0) {
    return HeaderSecretTypeEnum.Custom;
  }
  return HeaderSecretTypeEnum.None;
};

// auth to store header secret
const toStoreHeaderSecret = (
  config: HeaderSecretConfigType,
  type: HeaderSecretTypeEnum,
  enabled: boolean
): StoreSecretValueType => {
  if (!enabled) return {};

  if (type === HeaderSecretTypeEnum.Bearer && config.Bearer) {
    return { Bearer: { secret: config.Bearer.secret || '', value: config.Bearer.value || '' } };
  }
  if (type === HeaderSecretTypeEnum.Basic && config.Basic) {
    return { Basic: { secret: config.Basic.secret || '', value: config.Basic.value || '' } };
  }
  if (type === HeaderSecretTypeEnum.Custom && Array.isArray(config.customs)) {
    return config.customs.reduce<StoreSecretValueType>((acc, item) => {
      if (!item?.key) return acc;
      acc[item.key] = {
        secret: item.value?.secret || '',
        value: item.value?.value || ''
      };
      return acc;
    }, {});
  }
  return {};
};

const ParamsAuthConfig = ({
  storeHeaderSecretConfig,
  onUpdate,
  buttonProps,
  parentId = '',
  onSaved,
  haveTool
}: {
  storeHeaderSecretConfig?: StoreSecretValueType;
  onUpdate: (data: StoreSecretValueType) => void;
  buttonProps?: ButtonProps;
  parentId?: string;
  onSaved?: (payload: OnSavedPayload) => void;
  haveTool?: boolean;
}) => {
  const { t } = useTranslation();
  const headerSecretList = [
    {
      label: t('common:auth_type.None'),
      value: HeaderSecretTypeEnum.None
    },
    {
      label: 'Bearer',
      value: HeaderSecretTypeEnum.Bearer
    },
    {
      label: 'Basic',
      value: HeaderSecretTypeEnum.Basic
    },
    {
      label: t('common:auth_type.Custom'),
      value: HeaderSecretTypeEnum.Custom
    }
  ];

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { toast } = useToast();
  const appDetail = useContextSelector(AppContext, (e) => e.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);

  const [schemaUrl, setSchemaUrl] = useState<string>('');
  const [updateTrigger, setUpdateTrigger] = useState<boolean>(false);
  const [apiData, setApiData] = useState<OpenApiJsonSchema>({ pathData: [], serverPath: '' });

  // custom headers key value
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>(() => {
    try {
      const kv = JSON.parse(watchHttpTool('pluginData.customHeaders') || '{}');
      return Object.keys(kv).map((k) => ({ key: k, value: kv[k] }));
    } catch {
      return [];
    }
  });

  // modal form data
  const {
    register: httpToolRegister,
    setValue: setHttpToolValue,
    handleSubmit: handleHttpToolSubmit,
    watch: watchHttpTool,
    reset: resetHttpToolForm
  } = useForm<EditHttpToolSetProps>({
    defaultValues: {
      avatar: '',
      name: appDetail?.name || '',
      intro: '',
      pluginData: {
        apiSchemaStr: '',
        customHeaders: '{"Authorization":"Bearer"}'
      }
    }
  });

  const apiSchemaStr = watchHttpTool('pluginData.apiSchemaStr');

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
      setHttpToolValue('pluginData.apiSchemaStr', JSON.stringify(schema, null, 2));
    },
    errorToast: t('common:plugin.Invalid Schema')
  });

  // validate apiSchemaStr
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

  const { mutate: onUpdateHttpTool, isLoading: isUpdatingHttpTool } = useRequest({
    mutationFn: async (data: EditHttpToolSetProps) => {
      const userApiSchemaStr = data.pluginData?.apiSchemaStr;
      const hasValidApiSchema =
        userApiSchemaStr && userApiSchemaStr.trim() !== '' && userApiSchemaStr !== '{}';
      const authConfig: HeaderSecretConfigType = {
        Bearer: BearerValue,
        Basic: BasicValue,
        customs: authHeaders
      };
      return putUpdateHttpPlugin({
        appId: appDetail?._id || '',
        name: appDetail?.name || data.name,
        intro: data.intro,
        avatar: data.avatar,
        pluginData: {
          apiSchemaStr: hasValidApiSchema ? userApiSchemaStr : '{}',
          customHeaders: data.pluginData?.customHeaders
        },
        headerSecret: toStoreHeaderSecret(authConfig, currentAuthType, authEnabled)
      });
    },
    onSuccess: async (_, variables) => {
      try {
        const apiSchemaStr = variables?.pluginData?.apiSchemaStr || '';
        if (apiSchemaStr) {
          const schema = await str2OpenApiSchema(apiSchemaStr);
          const list: HttpToolConfigType[] = (schema.pathData || []).map((item: any) => ({
            name: item.name,
            description: item.description || '',
            inputSchema: {
              type: 'object',
              properties: {
                ...(Array.isArray(item.params)
                  ? item.params.reduce((acc: any, p: any) => {
                      acc[p.name] = {
                        type: p?.schema?.type || 'string',
                        description: p?.description
                      };
                      return acc;
                    }, {})
                  : {}),
                ...(item.request?.content?.['application/json']?.schema?.properties || {})
              },
              required: [
                ...(Array.isArray(item.params)
                  ? item.params.filter((p: any) => p.required).map((p: any) => p.name)
                  : []),
                ...((item.request?.content?.['application/json']?.schema?.required as string[]) ||
                  [])
              ]
            }
          }));
          onSaved?.({ url: schema.serverPath || '', toolList: list } as OnSavedPayload);
        }
      } catch {}
      toast({ status: 'success', title: t('common:update_success') });
      reloadApp();
      onClose();
    },
    errorToast: t('common:update_failed')
  });

  // stored data to form data
  const toFormHeaderSecret: HeaderSecretConfigType = useMemo(() => {
    if (!storeHeaderSecretConfig || Object.keys(storeHeaderSecretConfig).length === 0) {
      return {};
    }
    const entries = Object.entries(storeHeaderSecretConfig);
    const [key, value] = entries[0];
    if (
      entries.length === 1 &&
      (key === HeaderSecretTypeEnum.Bearer || key === HeaderSecretTypeEnum.Basic)
    ) {
      return {
        [key]: {
          secret: value.secret,
          value: value.value
        }
      };
    }
    return {
      customs: entries.map(([key, value]) => ({
        key,
        value: {
          secret: value.secret,
          value: value.value
        }
      }))
    };
  }, [storeHeaderSecretConfig]);

  // auth
  const [currentAuthType, setCurrentAuthType] = useState<HeaderSecretTypeEnum>(
    getSecretType(toFormHeaderSecret)
  );
  const [authEnabled, setAuthEnabled] = useState<boolean>(false);
  const [editingIndex, setEditingIndex] = useState<number>();
  const {
    register: authRegister,
    watch: watchAuth,
    handleSubmit: authHandleSubmit,
    reset: resetAuthForm
  } = useForm<HeaderSecretConfigType>({
    defaultValues: {
      Basic: toFormHeaderSecret?.Basic || { secret: '', value: '' },
      Bearer: toFormHeaderSecret?.Bearer || { secret: '', value: '' },
      customs: toFormHeaderSecret?.customs || []
    }
  });

  const BearerValue = watchAuth('Bearer');
  const BasicValue = watchAuth('Basic');

  const [authHeaders, setAuthHeaders] = useState<
    { key: string; value: { secret: string; value: string } }[]
  >(toFormHeaderSecret?.customs || []);

  // add default auth header automatically
  useEffect(() => {
    if (currentAuthType === HeaderSecretTypeEnum.Custom && authHeaders.length === 0) {
      setAuthHeaders([{ key: '', value: { secret: '', value: '' } }]);
    }
  }, [currentAuthType, authHeaders.length]);

  // init modal data
  const handleModalOpen = () => {
    // restore http tool form
    if (appDetail?.pluginData) {
      resetHttpToolForm({
        avatar: appDetail.avatar || '',
        name: appDetail.name || '',
        intro: appDetail.intro || '',
        pluginData: {
          apiSchemaStr:
            appDetail.pluginData.apiSchemaStr === '{}' ? '' : appDetail.pluginData.apiSchemaStr,
          customHeaders: appDetail.pluginData.customHeaders || '{"Authorization":"Bearer"}'
        }
      });

      // restore custom headers
      try {
        const kv = JSON.parse(appDetail.pluginData.customHeaders || '{}');
        setCustomHeaders(Object.keys(kv).map((k) => ({ key: k, value: kv[k] })));
      } catch {
        setCustomHeaders([]);
      }
    }

    // restore auth form
    resetAuthForm({
      Basic: toFormHeaderSecret?.Basic || { secret: '', value: '' },
      Bearer: toFormHeaderSecret?.Bearer || { secret: '', value: '' },
      customs: toFormHeaderSecret?.customs || []
    });

    // restore auth headers
    setAuthHeaders(toFormHeaderSecret?.customs || []);

    // restore current auth type
    setCurrentAuthType(getSecretType(toFormHeaderSecret));
    const savedAuthEnabled = !!(
      storeHeaderSecretConfig && Object.keys(storeHeaderSecretConfig).length > 0
    );
    setAuthEnabled(savedAuthEnabled);

    // reset temporary state
    setSchemaUrl('');
    setEditingIndex(undefined);
    setApiData({ pathData: [], serverPath: '' });

    onOpen();
  };

  return (
    <>
      <Button
        backgroundColor={'#3370FF'}
        borderRadius={'md'}
        {...buttonProps}
        leftIcon={<MyIcon name={haveTool ? 'change' : 'common/setting'} w={'18px'} h={'18px'} />}
        onClick={handleModalOpen}
      >
        {haveTool ? t('common:Config') : t('common:Start_config')}
      </Button>
      {isOpen && (
        <MyModal
          isOpen={isOpen}
          onClose={onClose}
          iconSrc={'common/setting'}
          iconColor={'primary.600'}
          title={t('common:Params_config')}
          w={600}
        >
          <ModalBody px={9}>
            {/* import */}
            <Box mt={2}>
              <Box
                color={'myGray.800'}
                fontWeight={'bold'}
                justifyContent={'space-between'}
                display={'flex'}
              >
                <Box
                  my={'auto'}
                  color={'myGray.900'}
                  fontFamily={'PingFang SC'}
                  fontSize={'14px'}
                  fontStyle={'normal'}
                  fontWeight={'500'}
                  lineHeight={'20px'}
                  letterSpacing={'0.1px'}
                >
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
                {...httpToolRegister('pluginData.apiSchemaStr')}
                bg={'myWhite.600'}
                rows={10}
                mt={3}
                onBlur={(e) => {
                  const content = e.target.value;
                  setHttpToolValue('pluginData.apiSchemaStr', content || '');
                }}
              />
            </Box>
            {/* import */}

            <>
              <Box
                mt={6}
                mb={2}
                color={'myGray.900'}
                fontFamily={'PingFang SC'}
                fontSize={'14px'}
                fontStyle={'normal'}
                fontWeight={'500'}
                lineHeight={'20px'}
                letterSpacing={'0.1px'}
              >
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
                                  const newHeaders = prev.map((h, i) =>
                                    i === index ? { ...h, key: val } : h
                                  );
                                  const json =
                                    '{\n' +
                                    newHeaders.map((h) => `"${h.key}":"${h.value}"`).join(',\n') +
                                    '\n}';
                                  setHttpToolValue('pluginData.customHeaders', json);
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
                                    setHttpToolValue('pluginData.customHeaders', json);
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
                                    setHttpToolValue('pluginData.customHeaders', json);
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
                                setHttpToolValue('pluginData.customHeaders', json);
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
            <Box>
              <Box mt={6} display={'flex'} alignItems={'center'} gap={6}>
                <Box
                  color={'myGray.900'}
                  fontFamily={'PingFang SC'}
                  fontSize={'14px'}
                  fontStyle={'normal'}
                  fontWeight={'500'}
                  lineHeight={'20px'}
                  letterSpacing={'0.1px'}
                >
                  {t('common:enable_auth')}
                </Box>
                <Switch
                  isChecked={authEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAuthEnabled(checked);
                  }}
                />
              </Box>
              {authEnabled && (
                <Box mt={'16px'}>
                  <Box
                    color={'myGray.900'}
                    fontFamily={'PingFang SC'}
                    fontSize={'14px'}
                    fontStyle={'normal'}
                    fontWeight={'500'}
                    lineHeight={'20px'}
                    letterSpacing={'0.1px'}
                  >
                    {t('common:auth_type')}
                  </Box>
                  <Box my={2}>
                    <MySelect
                      bg={'myGray.50'}
                      value={currentAuthType}
                      onChange={setCurrentAuthType}
                      list={headerSecretList}
                    />
                  </Box>
                  {currentAuthType !== HeaderSecretTypeEnum.None && (
                    <>
                      <Flex
                        mb={2}
                        gap={2}
                        color={'myGray.900'}
                        fontWeight={'medium'}
                        fontSize={'14px'}
                      >
                        {currentAuthType === HeaderSecretTypeEnum.Custom && (
                          <Box w={1 / 3}>{t('common:key')}</Box>
                        )}
                        <Box w={2 / 3}>{t('common:value')}</Box>
                      </Flex>

                      {currentAuthType === HeaderSecretTypeEnum.Bearer ||
                      currentAuthType === HeaderSecretTypeEnum.Basic ? (
                        <AuthValueDisplay
                          key={currentAuthType}
                          showInput={getShowInput({
                            secretValue:
                              currentAuthType === HeaderSecretTypeEnum.Bearer
                                ? BearerValue
                                : BasicValue,
                            editingIndex,
                            index: 0
                          })}
                          fieldName={`${currentAuthType}.value` as any}
                          onEdit={setEditingIndex}
                          register={authRegister}
                        />
                      ) : (
                        <Box>
                          {authHeaders.map((item, index) => (
                            <Flex key={index} mb={2} align="center">
                              <Input
                                w={1 / 3}
                                h={8}
                                bg="myGray.50"
                                placeholder="key"
                                maxLength={64}
                                value={item.key}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  setAuthHeaders((prev) =>
                                    prev.map((h, i) => (i === index ? { ...h, key: newValue } : h))
                                  );
                                }}
                              />
                              <Box w={2 / 3} ml={2}>
                                <Input
                                  placeholder={'Value'}
                                  bg={'myGray.50'}
                                  h={8}
                                  maxLength={200}
                                  value={item.value.value}
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    setAuthHeaders((prev) =>
                                      prev.map((h, i) =>
                                        i === index
                                          ? { ...h, value: { ...h.value, value: newValue } }
                                          : h
                                      )
                                    );
                                  }}
                                />
                              </Box>
                              {authHeaders.length > 1 && (
                                <IconButton
                                  aria-label="Remove header"
                                  icon={<MyIcon name="delete" w="16px" />}
                                  size="sm"
                                  variant="ghost"
                                  color={'myGray.500'}
                                  _hover={{ color: 'red.500' }}
                                  isDisabled={authHeaders.length <= 1}
                                  onClick={() =>
                                    setAuthHeaders((prev) => prev.filter((_, i) => i !== index))
                                  }
                                />
                              )}
                            </Flex>
                          ))}

                          <Button
                            leftIcon={<MyIcon name="common/addLight" w="16px" />}
                            variant="whiteBase"
                            minH={8}
                            h={8}
                            onClick={() =>
                              setAuthHeaders((prev) => [
                                ...prev,
                                { key: '', value: { secret: '', value: '' } }
                              ])
                            }
                          >
                            {t('common:add_new')}
                          </Button>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              )}
            </Box>
          </ModalBody>
          <ModalFooter px={9} display={'flex'} flexDirection={'column'}>
            <Box display={'flex'} justifyContent={'end'} w={'full'} gap={3}>
              <Button variant={'whiteBase'} onClick={onClose}>
                {t('common:Close')}
              </Button>
              <Button
                isDisabled={apiData.pathData.length === 0}
                onClick={handleHttpToolSubmit((data) => onUpdateHttpTool(data))}
                isLoading={isUpdatingHttpTool}
              >
                {t('common:Save')}
              </Button>
            </Box>
          </ModalFooter>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(ParamsAuthConfig);
