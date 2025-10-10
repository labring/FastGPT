import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  Textarea,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Switch
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { parseCurl } from '@fastgpt/global/common/string/http';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  headerValue2StoreHeader,
  storeHeader2HeaderValue
} from '@/components/common/secret/HeaderAuthConfig';
import HeaderAuthForm from '@/components/common/secret/HeaderAuthForm';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import { putUpdateHttpPlugin } from '@/web/core/app/api/plugin';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

type ManualToolFormType = {
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headerSecret: StoreSecretValueType;
};

type CustomParamItemType = {
  key: string;
  description: string;
  type: string;
  required: boolean;
  isTool: boolean;
};

type ParamItemType = {
  key: string;
  value: string;
};

const ManualToolModal = ({
  onClose,
  editingTool
}: {
  onClose: () => void;
  editingTool?: HttpToolConfigType;
}) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);
  const isEditMode = editingTool !== undefined;
  const editingToolName = editingTool?.name;

  const { register, handleSubmit, watch, setValue, reset } = useForm<ManualToolFormType>({
    defaultValues: {
      name: editingTool?.name || '',
      description: editingTool?.description || '',
      method: (editingTool?.method.toUpperCase() as any) || 'POST',
      path: editingTool?.path || '',
      headerSecret: editingTool?.headerSecret || {}
    }
  });

  const method = watch('method');
  const headerSecret = watch('headerSecret');

  const [customParams, setCustomParams] = useState<CustomParamItemType[]>([]);
  const [editingParam, setEditingParam] = useState<
    (CustomParamItemType & { index?: number }) | null
  >(null);

  const [params, setParams] = useState<ParamItemType[]>([]);
  const [bodyType, setBodyType] = useState<string>('json');
  const [bodyContent, setBodyContent] = useState<string>('');
  const [bodyFormData, setBodyFormData] = useState<ParamItemType[]>([]);
  const [headers, setHeaders] = useState<ParamItemType[]>([]);

  const {
    onOpen: onOpenCurlImport,
    isOpen: isOpenCurlImport,
    onClose: onCloseCurlImport
  } = useDisclosure();

  const {
    onOpen: onOpenParamEdit,
    isOpen: isOpenParamEdit,
    onClose: onCloseParamEdit
  } = useDisclosure();

  useEffect(() => {
    if (editingTool) {
      const restoredCustomParams: CustomParamItemType[] = Object.entries(
        editingTool.inputSchema.properties || {}
      ).map(([key, value]: [string, any]) => ({
        key,
        description: value.description || '',
        type: value.type || 'string',
        required: editingTool.inputSchema.required?.includes(key) || false,
        isTool: true
      }));
      setCustomParams(restoredCustomParams);

      if (editingTool.staticParams) {
        setParams(editingTool.staticParams);
      }
      if (editingTool.staticHeaders) {
        setHeaders(editingTool.staticHeaders);
      }

      if (editingTool.staticBody) {
        setBodyType(editingTool.staticBody.type);
        if (editingTool.staticBody.content) {
          setBodyContent(editingTool.staticBody.content);
        }
        if (editingTool.staticBody.formData) {
          setBodyFormData(editingTool.staticBody.formData);
        }
      }
    }
  }, [editingTool]);

  const { runAsync: onSubmit, loading: isSubmitting } = useRequest2(
    async (data: ManualToolFormType) => {
      const inputProperties: Record<string, any> = {};
      const inputRequired: string[] = [];

      customParams.forEach((param) => {
        if (param.isTool) {
          inputProperties[param.key] = {
            type: param.type,
            description: param.description || ''
          };
          if (param.required) {
            inputRequired.push(param.key);
          }
        }
      });

      const newTool: HttpToolConfigType = {
        name: data.name,
        description: data.description,
        path: data.path,
        method: data.method.toLowerCase(),
        inputSchema: {
          type: 'object',
          properties: inputProperties,
          required: inputRequired
        },
        outputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        ...(params.length > 0 && { staticParams: params }),
        ...(headers.length > 0 && { staticHeaders: headers }),
        ...(bodyType !== 'none' && {
          staticBody: {
            type: bodyType as any,
            ...(bodyType === 'json' || bodyType === 'xml' || bodyType === 'raw'
              ? { content: bodyContent }
              : {}),
            ...(bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded'
              ? { formData: bodyFormData }
              : {})
          }
        }),
        headerSecret: data.headerSecret
      };

      const toolSetNode = appDetail.modules.find(
        (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
      );
      const existingToolList = toolSetNode?.toolConfig?.httpToolSet?.toolList || [];

      let updatedToolList: HttpToolConfigType[];
      if (isEditMode && editingToolName) {
        updatedToolList = existingToolList.map((t) => (t.name === editingToolName ? newTool : t));
      } else {
        updatedToolList = [...existingToolList, newTool];
      }

      return putUpdateHttpPlugin({
        appId: appDetail._id,
        toolList: updatedToolList
      });
    },
    {
      onSuccess: () => {
        reloadApp();
        onClose();
      }
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc={isEditMode ? 'modal/edit' : 'common/addLight'}
      iconColor={'primary.600'}
      title={isEditMode ? t('app:Edit_tool') : t('app:Add_tool')}
      maxW={'1167px'}
    >
      <ModalBody display={'flex'}>
        <Flex w={'1167px'}>
          <Box w={'500px'} px={9} py={3} borderRight={'1px solid'} borderColor={'myGray.200'}>
            <Flex gap={8} mb={6} alignItems={'center'}>
              <FormLabel>{t('app:Tool_name')}</FormLabel>
              <Input h={8} {...register('name', { required: true })} />
            </Flex>
            <Box mb={6}>
              <FormLabel mb={2}>{t('app:Tool_description')}</FormLabel>
              <Textarea {...register('description')} rows={8} minH={'150px'} maxH={'400px'} />
            </Box>
            <Box mb={6}>
              <Flex mb={2} alignItems={'center'} justifyContent={'space-between'}>
                <FormLabel>{t('common:core.module.Http request settings')}</FormLabel>
                <Button size={'sm'} onClick={onOpenCurlImport}>
                  {t('common:core.module.http.curl import')}
                </Button>
              </Flex>
              <Flex gap={2}>
                <MySelect
                  h={9}
                  w={'100px'}
                  value={method}
                  list={[
                    {
                      label: 'GET',
                      value: 'GET'
                    },
                    {
                      label: 'POST',
                      value: 'POST'
                    },
                    {
                      label: 'PUT',
                      value: 'PUT'
                    },
                    {
                      label: 'DELETE',
                      value: 'DELETE'
                    },
                    {
                      label: 'PATCH',
                      value: 'PATCH'
                    }
                  ]}
                  onChange={(e) => {
                    setValue('method', e as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH');
                  }}
                />
                <Input
                  {...register('path', { required: true })}
                  placeholder={t('common:core.module.input.label.Http Request Url')}
                />
              </Flex>
            </Box>
            <Box alignItems={'center'}>
              <FormLabel mb={0}>{t('common:auth_config')}</FormLabel>
              <Box>
                <HeaderAuthForm
                  headerSecretValue={storeHeader2HeaderValue(headerSecret)}
                  onChange={(data) => {
                    const storeData = headerValue2StoreHeader(data);
                    setValue('headerSecret', storeData);
                  }}
                  fontWeight="normal"
                />
              </Box>
            </Box>
          </Box>

          <Box flex={1} px={9} py={3}>
            <Box mb={6}>
              <Flex alignItems={'center'} mb={2}>
                <FormLabel flex={1}>{t('app:Custom_params')}</FormLabel>
                <Button
                  size={'sm'}
                  variant={'whitePrimary'}
                  leftIcon={<MyIcon name={'common/addLight'} w={'14px'} />}
                  onClick={() => {
                    setEditingParam({
                      key: '',
                      description: '',
                      type: 'string',
                      required: false,
                      isTool: true
                    });
                    onOpenParamEdit();
                  }}
                >
                  {t('common:add_new')}
                </Button>
              </Flex>
              <CustomParamsTable
                list={customParams}
                onEdit={(param, index) => {
                  setEditingParam({ ...param, index });
                  onOpenParamEdit();
                }}
                onDelete={(index) => {
                  setCustomParams((prev) => prev.filter((_, i) => i !== index));
                }}
              />
            </Box>

            <Box mb={6}>
              <FormLabel mb={2}>Params</FormLabel>
              <ParamsTable list={params} setList={setParams} />
            </Box>

            <Box mb={6}>
              <FormLabel mb={2}>Body</FormLabel>
              <Flex
                mb={2}
                p={1}
                flexWrap={'nowrap'}
                bg={'myGray.25'}
                border={'1px solid'}
                borderColor={'myGray.200'}
                borderRadius={'8px'}
                justifyContent={'space-between'}
              >
                {['none', 'json', 'form-data', 'x-www-form-urlencoded', 'xml', 'raw'].map(
                  (type) => (
                    <Box
                      key={type}
                      cursor={'pointer'}
                      px={3}
                      py={1.5}
                      fontSize={'12px'}
                      fontWeight={'medium'}
                      color={'myGray.500'}
                      borderRadius={'6px'}
                      bg={bodyType === type ? 'white' : 'none'}
                      boxShadow={
                        bodyType === type
                          ? '0 1px 2px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.15)'
                          : ''
                      }
                      onClick={() => setBodyType(type)}
                    >
                      {type}
                    </Box>
                  )
                )}
              </Flex>
              {bodyType === 'json' || bodyType === 'xml' || bodyType === 'raw' ? (
                <Textarea
                  value={bodyContent}
                  onChange={(e) => setBodyContent(e.target.value)}
                  minH={'100px'}
                  maxH={'200px'}
                />
              ) : bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded' ? (
                <ParamsTable list={bodyFormData} setList={setBodyFormData} />
              ) : null}
            </Box>

            <Box mb={6}>
              <FormLabel mb={2}>Headers</FormLabel>
              <ParamsTable list={headers} setList={setHeaders} />
            </Box>
          </Box>
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button onClick={handleSubmit((data) => onSubmit(data))} isLoading={isSubmitting}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>

      {isOpenCurlImport && (
        <CurlImportModal
          onClose={onCloseCurlImport}
          onImport={(parsed) => {
            setValue('method', parsed.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH');
            setValue('path', parsed.url);
            onCloseCurlImport();
          }}
        />
      )}

      {isOpenParamEdit && editingParam && (
        <CustomParamEditModal
          param={editingParam}
          onClose={onCloseParamEdit}
          onConfirm={(newParam) => {
            if (editingParam.index !== undefined) {
              setCustomParams((prev) =>
                prev.map((p, i) => (i === editingParam.index ? newParam : p))
              );
            } else {
              setCustomParams((prev) => [...prev, newParam]);
            }
            onCloseParamEdit();
          }}
        />
      )}
    </MyModal>
  );
};

const CurlImportModal = ({
  onClose,
  onImport
}: {
  onClose: () => void;
  onImport: (parsed: ReturnType<typeof parseCurl>) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { register, handleSubmit } = useForm({
    defaultValues: {
      curlContent: ''
    }
  });

  const handleCurlImport = async (content: string) => {
    try {
      const parsed = parseCurl(content);
      console.log(parsed);
      // onImport(parsed);
      toast({
        title: t('common:import_success'),
        status: 'success'
      });
    } catch (error: any) {
      toast({
        title: t('common:import_failed'),
        description: error.message,
        status: 'error'
      });
      console.error(error);
    }
  };

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="modal/edit"
      title={t('common:core.module.http.curl import')}
      w={600}
    >
      <ModalBody>
        <Textarea
          rows={20}
          mt={2}
          autoFocus
          {...register('curlContent')}
          placeholder={t('common:core.module.http.curl import placeholder')}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button onClick={handleSubmit((data) => handleCurlImport(data.curlContent))}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

const CustomParamEditModal = ({
  param,
  onClose,
  onConfirm
}: {
  param: CustomParamItemType;
  onClose: () => void;
  onConfirm: (param: CustomParamItemType) => void;
}) => {
  const { t } = useTranslation();
  const isEdit = !!param.key;

  const { register, handleSubmit, watch, setValue } = useForm<CustomParamItemType>({
    defaultValues: param
  });

  const typeList = [
    { label: 'string', value: 'string' },
    { label: 'number', value: 'number' },
    { label: 'boolean', value: 'boolean' },
    { label: 'object', value: 'object' },
    { label: 'array', value: 'array' }
  ];

  const type = watch('type');
  const required = watch('required');
  const isTool = watch('isTool');

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc={isEdit ? 'modal/edit' : 'common/addLight'}
      iconColor={'primary.600'}
      title={isEdit ? t('app:edit_param') : t('common:add_new_param')}
      w={500}
    >
      <ModalBody px={9}>
        <Flex mb={6} alignItems={'center'}>
          <FormLabel w={'120px'}>{t('common:core.module.http.Props name')}</FormLabel>
          <Input
            {...register('key', { required: true })}
            placeholder={t('common:core.module.http.Props name')}
            bg={'myGray.50'}
          />
        </Flex>

        <Flex mb={6}>
          <FormLabel w={'120px'}>{t('common:plugin.Description')}</FormLabel>
          <Textarea
            {...register('description')}
            rows={4}
            placeholder={t('common:plugin.Description')}
            bg={'myGray.50'}
          />
        </Flex>

        <Flex mb={6} alignItems={'center'}>
          <FormLabel w={'120px'}>{t('common:core.module.Data Type')}</FormLabel>
          <MySelect
            value={type}
            list={typeList}
            onChange={(val) => setValue('type', val)}
            flex={1}
          />
        </Flex>

        <Flex mb={6} alignItems={'center'}>
          <FormLabel w={'120px'}>{t('common:Required_input')}</FormLabel>
          <Switch isChecked={required} onChange={(e) => setValue('required', e.target.checked)} />
        </Flex>

        <Flex mb={6} alignItems={'center'}>
          <FormLabel w={'120px'}>{t('workflow:field_used_as_tool_input')}</FormLabel>
          <Switch isChecked={isTool} onChange={(e) => setValue('isTool', e.target.checked)} />
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button onClick={handleSubmit(onConfirm)}>{t('common:Confirm')}</Button>
      </ModalFooter>
    </MyModal>
  );
};

const CustomParamsTable = ({
  list,
  onEdit,
  onDelete
}: {
  list: CustomParamItemType[];
  onEdit: (param: CustomParamItemType, index: number) => void;
  onDelete: (index: number) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Box
      borderRadius={'md'}
      overflow={'hidden'}
      borderWidth={'1px'}
      borderBottom={'none'}
      bg={'white'}
    >
      <TableContainer overflowY={'visible'} overflowX={'unset'}>
        <Table size={'sm'}>
          <Thead>
            <Tr bg={'myGray.50'} h={8}>
              <Th px={2}>{t('common:core.module.http.Props name')}</Th>
              <Th px={2}>{t('common:plugin.Description')}</Th>
              <Th px={2}>{t('common:support.standard.type')}</Th>
              <Th px={2}>{t('app:type.Tool')}</Th>
              <Th px={2}>{t('common:Operation')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {list.map((item, index) => (
              <Tr key={index} h={8}>
                <Td px={2}>{item.key}</Td>
                <Td px={2}>{item.description}</Td>
                <Td px={2}>{item.type}</Td>
                <Td px={2}>{item.isTool ? '是' : '否'}</Td>
                <Td px={2}>
                  <Flex gap={2}>
                    <MyIcon
                      name={'edit'}
                      cursor={'pointer'}
                      _hover={{ color: 'primary.600' }}
                      w={'14px'}
                      onClick={() => onEdit(item, index)}
                    />
                    <MyIcon
                      name={'delete'}
                      cursor={'pointer'}
                      _hover={{ color: 'red.600' }}
                      w={'14px'}
                      onClick={() => onDelete(index)}
                    />
                  </Flex>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </Box>
  );
};

const ParamsTable = ({
  list,
  setList
}: {
  list: ParamItemType[];
  setList: React.Dispatch<React.SetStateAction<ParamItemType[]>>;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [updateTrigger, setUpdateTrigger] = useState(false);

  return (
    <Box borderRadius={'md'} overflow={'hidden'} borderWidth={'1px'} borderBottom={'none'}>
      <TableContainer overflowY={'visible'} overflowX={'unset'}>
        <Table size={'sm'}>
          <Thead>
            <Tr bg={'myGray.50'} h={8}>
              <Th px={2}>{t('common:core.module.http.Props name')}</Th>
              <Th px={2}>{t('common:core.module.http.Props value')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {[...list, { key: '', value: '' }].map((item, index) => (
              <Tr key={index}>
                <Td w={1 / 2} p={0} borderRight={'1px solid'} borderColor={'myGray.150'}>
                  <HttpInput
                    placeholder={'key'}
                    value={item.key}
                    onBlur={(val) => {
                      if (!val) return;

                      if (list.find((item, i) => i !== index && item.key === val)) {
                        setUpdateTrigger((prev) => !prev);
                        toast({
                          status: 'warning',
                          title: t('common:core.module.http.Key already exists')
                        });
                        return;
                      }

                      if (index === list.length) {
                        setList((prev) => [...prev, { key: val, value: '' }]);
                        setUpdateTrigger((prev) => !prev);
                      } else {
                        setList((prev) =>
                          prev.map((p, i) => (i === index ? { ...p, key: val } : p))
                        );
                      }
                    }}
                    updateTrigger={updateTrigger}
                  />
                </Td>
                <Td w={1 / 2} p={0} borderColor={'myGray.150'}>
                  <Box display={'flex'} alignItems={'center'}>
                    <HttpInput
                      placeholder={'value'}
                      value={item.value}
                      onBlur={(val) =>
                        setList((prevList) =>
                          prevList.map((p, i) => (i === index ? { ...p, value: val } : p))
                        )
                      }
                    />
                    {index !== list.length && (
                      <MyIcon
                        name={'delete'}
                        cursor={'pointer'}
                        _hover={{ color: 'red.600' }}
                        w={'14px'}
                        mx={'2'}
                        display={'block'}
                        onClick={() =>
                          setList((prevList) => prevList.filter((_, i) => i !== index))
                        }
                      />
                    )}
                  </Box>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default React.memo(ManualToolModal);
