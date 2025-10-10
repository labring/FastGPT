import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useState } from 'react';
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
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  HTTP_METHODS,
  type HttpMethod,
  toolValueTypeList,
  ContentTypes
} from '@fastgpt/global/core/workflow/constants';
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
import CurlImportModal from './CurlImportModal';

type ManualToolFormType = {
  name: string;
  description: string;
  method: HttpMethod;
  path: string;
  headerSecret: StoreSecretValueType;
  customParams: CustomParamItemType[];
  params: ParamItemType[];
  bodyType: ContentTypes;
  bodyContent: string;
  bodyFormData: ParamItemType[];
  headers: ParamItemType[];
};

type CustomParamItemType = {
  key: string;
  description: string;
  type: string;
  required: boolean;
  isTool: boolean;
};

export type ParamItemType = {
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
  const { toast } = useToast();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);

  const isEditMode = editingTool !== undefined;

  const { register, handleSubmit, watch, setValue } = useForm<ManualToolFormType>({
    defaultValues: {
      name: editingTool?.name || '',
      description: editingTool?.description || '',
      method: (editingTool?.method.toUpperCase() as any) || 'POST',
      path: editingTool?.path || '',
      headerSecret: editingTool?.headerSecret || {},
      customParams: editingTool
        ? Object.entries(editingTool.inputSchema.properties || {}).map(
            ([key, value]: [string, any]) => ({
              key,
              description: value.description || '',
              type: value.type || 'string',
              required: editingTool.inputSchema.required?.includes(key) || false,
              isTool: !!value['x-tool-description']
            })
          )
        : [],
      params: editingTool?.staticParams || [],
      bodyType: editingTool?.staticBody?.type || ContentTypes.json,
      bodyContent: editingTool?.staticBody?.content || '',
      bodyFormData: editingTool?.staticBody?.formData || [],
      headers: editingTool?.staticHeaders || []
    }
  });

  const method = watch('method');
  const headerSecret = watch('headerSecret');
  const customParams = watch('customParams');
  const params = watch('params');
  const bodyType = watch('bodyType');
  const bodyContent = watch('bodyContent');
  const bodyFormData = watch('bodyFormData');
  const headers = watch('headers');

  const hasBody = method !== 'GET' && method !== 'DELETE';
  const isFormBody =
    bodyType === ContentTypes.formData || bodyType === ContentTypes.xWwwFormUrlencoded;
  const isContentBody =
    bodyType === ContentTypes.json ||
    bodyType === ContentTypes.xml ||
    bodyType === ContentTypes.raw;

  const [editingParam, setEditingParam] = useState<CustomParamItemType | null>(null);

  const {
    onOpen: onOpenCurlImport,
    isOpen: isOpenCurlImport,
    onClose: onCloseCurlImport
  } = useDisclosure();

  const { runAsync: onSubmit, loading: isSubmitting } = useRequest2(
    async (data: ManualToolFormType) => {
      if (bodyType === ContentTypes.json && bodyContent) {
        try {
          JSON.parse(bodyContent);
        } catch (error) {
          return Promise.reject(t('common:json_parse_error'));
        }
      }

      const inputProperties: Record<string, any> = {};
      const inputRequired: string[] = [];
      customParams.forEach((param) => {
        inputProperties[param.key] = {
          type: param.type,
          description: param.description || '',
          'x-tool-description': param.isTool ? param.description : ''
        };
        if (param.required) {
          inputRequired.push(param.key);
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
        ...(hasBody &&
          bodyType !== ContentTypes.none && {
            staticBody: {
              type: bodyType,
              ...(isContentBody ? { content: bodyContent } : {}),
              ...(isFormBody ? { formData: bodyFormData } : {})
            }
          }),
        headerSecret: data.headerSecret
      };

      const toolSetNode = appDetail.modules.find(
        (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
      );
      const existingToolList = toolSetNode?.toolConfig?.httpToolSet?.toolList || [];

      const updatedToolList = (() => {
        if (isEditMode) {
          return existingToolList.map((tool) => (tool.name === editingTool?.name ? newTool : tool));
        }
        return [...existingToolList, newTool];
      })();

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
          <Flex
            w={'500px'}
            px={9}
            py={3}
            flexDirection={'column'}
            gap={6}
            borderRight={'1px solid'}
            borderColor={'myGray.200'}
          >
            <Flex gap={8} alignItems={'center'}>
              <FormLabel>{t('app:Tool_name')}</FormLabel>
              <Input
                h={8}
                {...register('name', { required: true })}
                placeholder={t('app:Tool_name')}
              />
            </Flex>
            <Box>
              <FormLabel mb={2}>{t('app:Tool_description')}</FormLabel>
              <Textarea
                {...register('description')}
                rows={8}
                minH={'150px'}
                maxH={'400px'}
                placeholder={t('app:Tool_description')}
              />
            </Box>
            <Box>
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
                  list={HTTP_METHODS.map((method) => ({ label: method, value: method }))}
                  onChange={(e) => setValue('method', e)}
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
          </Flex>

          <Flex flex={1} px={9} py={3} flexDirection={'column'} gap={6}>
            <Box>
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
                  }}
                >
                  {t('common:add_new')}
                </Button>
              </Flex>
              <CustomParamsTable
                list={customParams}
                onEdit={(param) => {
                  setEditingParam(param);
                }}
                onDelete={(index) => {
                  setValue(
                    'customParams',
                    customParams.filter((_, i) => i !== index)
                  );
                }}
              />
            </Box>
            <Box>
              <FormLabel mb={2}>Params</FormLabel>
              <ParamsTable list={params} setList={(newParams) => setValue('params', newParams)} />
            </Box>
            {hasBody && (
              <Box>
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
                  {Object.values(ContentTypes).map((type) => (
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
                      onClick={() => setValue('bodyType', type)}
                    >
                      {type}
                    </Box>
                  ))}
                </Flex>
                {isContentBody && (
                  <Textarea
                    value={bodyContent}
                    onChange={(e) => setValue('bodyContent', e.target.value)}
                    onBlur={(e) => {
                      if (bodyType === ContentTypes.json && e.target.value) {
                        try {
                          JSON.parse(e.target.value);
                        } catch (error) {
                          toast({
                            status: 'warning',
                            title: t('common:json_parse_error')
                          });
                        }
                      }
                    }}
                    minH={'100px'}
                    maxH={'200px'}
                  />
                )}
                {isFormBody && (
                  <ParamsTable
                    list={bodyFormData}
                    setList={(newFormData) => setValue('bodyFormData', newFormData)}
                  />
                )}
              </Box>
            )}
            <Box>
              <FormLabel mb={2}>Headers</FormLabel>
              <ParamsTable
                list={headers}
                setList={(newHeaders) => setValue('headers', newHeaders)}
              />
            </Box>
          </Flex>
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
          onImport={(result) => {
            setValue('method', result.method);
            setValue('path', result.path);
            if (result.params) {
              setValue('params', result.params);
            }
            if (result.headers) {
              setValue('headers', result.headers);
            }
            setValue('bodyType', result.bodyType as ContentTypes);
            if (result.bodyContent) {
              setValue('bodyContent', result.bodyContent);
            }
            if (result.bodyFormData) {
              setValue('bodyFormData', result.bodyFormData);
            }
            onCloseCurlImport();
          }}
        />
      )}
      {editingParam && (
        <CustomParamEditModal
          param={editingParam}
          onClose={() => setEditingParam(null)}
          onConfirm={(newParam) => {
            if (editingParam.key) {
              setValue(
                'customParams',
                customParams.map((param) => (param.key === editingParam.key ? newParam : param))
              );
            } else {
              setValue('customParams', [...customParams, newParam]);
            }
          }}
        />
      )}
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
            {...register('description', { required: isTool })}
            rows={4}
            placeholder={t('app:tool_params_description_tips')}
            bg={'myGray.50'}
          />
        </Flex>

        <Flex mb={6} alignItems={'center'}>
          <FormLabel w={'120px'}>{t('common:core.module.Data Type')}</FormLabel>
          <MySelect
            value={type}
            list={toolValueTypeList}
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
        <Button
          onClick={handleSubmit((data) => {
            onConfirm(data);
            onClose();
          })}
        >
          {t('common:Confirm')}
        </Button>
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
  onEdit: (param: CustomParamItemType) => void;
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
                <Td px={2}>{item.isTool ? t('common:yes') : t('common:no')}</Td>
                <Td px={2}>
                  <Flex gap={2}>
                    <MyIcon
                      name={'edit'}
                      cursor={'pointer'}
                      _hover={{ color: 'primary.600' }}
                      w={'14px'}
                      onClick={() => onEdit(item)}
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
  setList: (list: ParamItemType[]) => void;
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
                        setList([...list, { key: val, value: '' }]);
                        setUpdateTrigger((prev) => !prev);
                      } else {
                        setList(list.map((p, i) => (i === index ? { ...p, key: val } : p)));
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
                        setList(list.map((p, i) => (i === index ? { ...p, value: val } : p)))
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
                        onClick={() => setList(list.filter((_, i) => i !== index))}
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
