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
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';

// 添加EditHttpPluginProps类型定义
export type EditHttpPluginProps = {
  id?: string;
  avatar: string;
  name: string;
  intro?: string;
  pluginData?: AppSchema['pluginData'];
};

// 新增：保存成功后的本地更新回调类型
type OnSavedPayload = { url: string; toolList: HttpToolConfigType[] };

// 组件 props（仅展示新增项，其他保持不变）
// 如已有 Props 定义，请合并该字段
// @ts-ignore 这里直接在组件内部通过 props?.onSaved 可选使用

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
  const { toast } = useToast();

  const appDetail = useContextSelector(AppContext, (e) => e.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);

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

  // 添加HttpPluginEditModal相关的状态
  const [schemaUrl, setSchemaUrl] = useState('');
  const [updateTrigger, setUpdateTrigger] = useState(false);
  const [createType, setCreateType] = useState<'batch' | 'manual'>('batch');
  const [apiData, setApiData] = useState<OpenApiJsonSchema>({ pathData: [], serverPath: '' });

  // fish! 这个值应该不能这样处理defaultValues,后续再看看
  // 添加表单处理 - 用于HTTP插件创建
  const {
    register: httpPluginRegister,
    setValue: setHttpPluginValue,
    handleSubmit: handleHttpPluginSubmit,
    watch: watchHttpPlugin
  } = useForm<EditHttpPluginProps>({
    defaultValues: {
      avatar: '',
      name: appDetail?.name || '', // 使用appDetail.name作为默认名称
      intro: '',
      pluginData: {
        apiSchemaStr: '',
        customHeaders: '{"Authorization":"Bearer"}'
      }
    }
  });

  const apiSchemaStr = watchHttpPlugin('pluginData.apiSchemaStr');

  // 添加useRequest hook
  const { mutate: onUpdateHttpPlugin, isLoading: isUpdatingHttpPlugin } = useRequest({
    mutationFn: async (data: EditHttpPluginProps) => {
      // 检查用户是否输入了有效的apiSchemaStr
      const userApiSchemaStr = data.pluginData?.apiSchemaStr;
      const hasValidApiSchema =
        userApiSchemaStr && userApiSchemaStr.trim() !== '' && userApiSchemaStr !== '{}';

      // 现在的问题: 传入了apiSchemaStr,需要从apiSchemaStr中提取出serverPath字段,并且更新到modules[0].toolConfig.httpToolSet.url中
      return putUpdateHttpPlugin({
        appId: appDetail?._id || '', // 使用当前应用的ID
        name: appDetail?.name || data.name,
        intro: data.intro,
        avatar: data.avatar,
        pluginData: {
          // 如果用户输入了有效的apiSchemaStr，使用用户输入的值；否则使用占位符
          apiSchemaStr:
            createType === 'batch' ? (hasValidApiSchema ? userApiSchemaStr : '{}') : undefined,
          customHeaders: data.pluginData?.customHeaders
        }
      });
    },
    onSuccess: async (_, variables) => {
      try {
        //传url进来,url也需要更新
        // 仅在有 schema 时进行本地列表更新
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
          // @ts-ignore 由父组件在使用处透传 onSaved 实现本地 setUrl/setToolList
          onSaved?.({ url: schema.serverPath || '', toolList: list } as OnSavedPayload);
        }
      } catch {}

      // 成功提示 & 校准
      toast({ status: 'success' });
      reloadApp();
      onClose();
    },
    successToast: t('common:update_success'),
    errorToast: t('common:update_failed')
  });

  // 添加从URL加载API Schema的功能
  const { mutate: onClickUrlLoadApi, isLoading: isLoadingUrlApi } = useRequest({
    mutationFn: async () => {
      if (!schemaUrl || (!schemaUrl.startsWith('https://') && !schemaUrl.startsWith('http://'))) {
        return toast({
          title: t('common:plugin.Invalid URL'),
          status: 'warning'
        });
      }

      const schema = await getApiSchemaByUrl(schemaUrl);
      setHttpPluginValue('pluginData.apiSchemaStr', JSON.stringify(schema, null, 2));
    },
    errorToast: t('common:plugin.Invalid Schema')
  });

  // 添加schema验证的useEffect
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

  const headerSecretValue: HeaderSecretConfigType = useMemo(() => {
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

  const [currentAuthType, setCurrentAuthType] = useState<HeaderSecretTypeEnum>(
    getSecretType(headerSecretValue)
  );

  const [editingIndex, setEditingIndex] = useState<number>();
  const {
    control,
    register: authRegister,
    watch: watch,
    handleSubmit: authHandleSubmit,
    reset
  } = useForm<HeaderSecretConfigType>({
    defaultValues: {
      Basic: headerSecretValue?.Basic || { secret: '', value: '' },
      Bearer: headerSecretValue?.Bearer || { secret: '', value: '' },
      customs: headerSecretValue?.customs || []
    }
  });
  const {
    fields: customHeaders,
    append: appendHeader,
    remove: removeHeader
  } = useFieldArray({
    control,
    name: 'customs'
  });
  const BearerValue = watch('Bearer');
  const BasicValue = watch('Basic');

  // Add default custom
  useEffect(() => {
    if (currentAuthType === HeaderSecretTypeEnum.Custom && customHeaders.length === 0) {
      appendHeader({ key: '', value: { secret: '', value: '' } });
    }
  }, [currentAuthType, customHeaders.length, appendHeader]);

  const onSubmit = async (data: HeaderSecretConfigType) => {
    if (!headerSecretValue) return;

    const storeData: StoreSecretValueType = {};

    if (currentAuthType === HeaderSecretTypeEnum.Bearer) {
      storeData.Bearer = {
        value: data.Bearer?.value || '',
        secret: data.Bearer?.secret || ''
      };
    } else if (currentAuthType === HeaderSecretTypeEnum.Basic) {
      storeData.Basic = {
        value: data.Basic?.value || '',
        secret: data.Basic?.secret || ''
      };
    } else if (currentAuthType === HeaderSecretTypeEnum.Custom) {
      data.customs?.forEach((item) => {
        storeData[item.key] = item.value;
      });
    }

    onUpdate(storeData);
    onClose();
  };

  return (
    <>
      <Button
        backgroundColor={'#3370FF'}
        borderRadius={'md'}
        {...buttonProps}
        leftIcon={<MyIcon name={haveTool ? 'change' : 'common/setting'} w={'18px'} h={'18px'} />}
        onClick={onOpen}
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
                {...httpPluginRegister('pluginData.apiSchemaStr')}
                bg={'myWhite.600'}
                rows={10}
                mt={3}
                onBlur={(e) => {
                  const content = e.target.value;
                  // 总是更新值，即使是空值，这样表单状态能正确反映用户输入
                  setHttpPluginValue('pluginData.apiSchemaStr', content || '');
                }}
              />
            </Box>

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
                              // value={item.key}
                              // onBlur={(val) => {
                              //   setCustomHeaders((prev) => {
                              //     const newHeaders = prev.map((item, i) =>
                              //       i === index ? { ...item, key: val } : item
                              //     );
                              //     setValue(
                              //       'pluginData.customHeaders',
                              //       '{\n' +
                              //         newHeaders
                              //           .map((item) => `"${item.key}":"${item.value}"`)
                              //           .join(',\n') +
                              //         '\n}'
                              //     );
                              //     return newHeaders;
                              //   });
                              // }}
                              updateTrigger={updateTrigger}
                            />
                          </Td>
                          <Td p={0}>
                            <Box display={'flex'} alignItems={'center'}>
                              <HttpInput
                                placeholder={t('common:core.module.http.Props value')}
                                // value={item.value}
                                // onBlur={(val) =>
                                //   setCustomHeaders((prev) => {
                                //     const newHeaders = prev.map((item, i) =>
                                //       i === index ? { ...item, value: val } : item
                                //     );
                                //     setValue(
                                //       'pluginData.customHeaders',
                                //       '{\n' +
                                //         newHeaders
                                //           .map((item) => `"${item.key}":"${item.value}"`)
                                //           .join(',\n') +
                                //         '\n}'
                                //     );
                                //     return newHeaders;
                                //   })
                                // }
                              />
                              <MyIcon
                                name={'delete'}
                                cursor={'pointer'}
                                _hover={{ color: 'red.600' }}
                                w={'14px'}
                                // onClick={() =>
                                //   setCustomHeaders((prev) => {
                                //     const newHeaders = prev.filter((val) => val.key !== item.key);
                                //     setValue(
                                //       'pluginData.customHeaders',
                                //       '{\n' +
                                //         newHeaders
                                //           .map((item) => `"${item.key}":"${item.value}"`)
                                //           .join(',\n') +
                                //         '\n}'
                                //     );
                                //     return newHeaders;
                                //   })
                                // }
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
                            // updateTrigger={updateTrigger}
                            // onBlur={(val) => {
                            //   if (!val) return;
                            //   setCustomHeaders((prev) => {
                            //     const newHeaders = [...prev, { key: val, value: ' ' }];
                            //     setValue(
                            //       'pluginData.customHeaders',
                            //       '{\n' +
                            //         newHeaders
                            //           .map((item) => `"${item.key}":"${item.value}"`)
                            //           .join(',\n') +
                            //         '\n}'
                            //     );
                            //     return newHeaders;
                            //   });
                            //   setUpdateTrigger((prev) => !prev);
                            // }}
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
              <Switch />
            </Box>
          </ModalBody>
          <ModalFooter px={9} display={'flex'} flexDirection={'column'}>
            <Box display={'flex'} justifyContent={'end'} w={'full'} gap={3}>
              <Button variant={'whiteBase'} onClick={onClose}>
                {t('common:Close')}
              </Button>
              <Button
                isDisabled={apiData.pathData.length === 0}
                onClick={handleHttpPluginSubmit((data) => onUpdateHttpPlugin(data))}
                isLoading={isUpdatingHttpPlugin}
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
