import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  ModalFooter,
  ModalBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useTheme,
  Link,
  Input,
  IconButton
} from '@chakra-ui/react';
import {
  getOpenApiKeys,
  createAOpenApiKey,
  delOpenApiById,
  putOpenApiKey
} from '@/web/support/openapi/api';
import type { EditApiKeyProps } from '@/global/support/openapi/api';
import dayjs from 'dayjs';
import { AddIcon } from '@chakra-ui/icons';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import DateTimePicker from '@fastgpt/web/components/common/DateTimePicker';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getDocPath } from '@/web/common/system/doc';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getAppDetailById } from '@/web/core/app/api';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

type EditProps = EditApiKeyProps & { _id?: string };
const defaultEditData: EditProps = {
  name: '',
  limit: {
    maxUsagePoints: -1
  }
};

const ApiKeyTable = ({ tips, appId }: { tips: string; appId?: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();
  const [baseUrl, setBaseUrl] = useState('https://fastgpt.io/api');
  const [editData, setEditData] = useState<EditProps>();
  const [apiKey, setApiKey] = useState('');
  const [showCallExampleModal, setShowCallExampleModal] = useState(false);
  const [appDetail, setAppDetail] = useState<AppDetailType | null>(null);

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: t('common:delete_api')
  });

  const { runAsync: onclickRemove } = useRequest(delOpenApiById, {
    onSuccess() {
      refetch();
    }
  });

  const {
    data: apiKeys = [],
    loading: isGetting,
    run: refetch
  } = useRequest(() => getOpenApiKeys({ appId }), {
    manual: false,
    refreshDeps: [appId]
  });

  useEffect(() => {
    setBaseUrl(feConfigs?.customApiDomain || `${location.origin}/api`);
  }, [feConfigs?.customApiDomain]);

  useEffect(() => {
    if (appId) {
      getAppDetailById(appId).then((detail) => setAppDetail(detail));
    }
  }, [appId]);

  return (
    <MyBox
      isLoading={isGetting}
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      position={'relative'}
    >
      <Box display={['block', 'flex']} alignItems={'center'}>
        <Box flex={1}>
          <Flex alignItems={'center'}>
            <MyIcon mr={2} name={'key'} w={'20px'} />
            <Box color={'myGray.900'} fontSize={'16px'}>
              {t('common:support.openapi.Api manager')}
            </Box>
            {feConfigs?.docUrl && (
              <>
                <Link
                  href={
                    feConfigs.openAPIDocUrl ||
                    getDocPath('/docs/introduction/development/openapi/intro')
                  }
                  target={'_blank'}
                  ml={4}
                  color={'primary.500'}
                  fontSize={'sm'}
                >
                  {t('common:read_doc')}
                </Link>
                <Box
                  ml={2}
                  color={'primary.500'}
                  fontSize={'sm'}
                  cursor={'pointer'}
                  onClick={() => setShowCallExampleModal(true)}
                  _hover={{ textDecoration: 'underline' }}
                >
                  {t('common:support.openapi.Call example')}
                </Box>
              </>
            )}
          </Flex>
          <Box fontSize={'mini'} color={'myGray.600'}>
            {tips}
          </Box>
        </Box>
        <Flex
          mt={[2, 0]}
          bg={'myGray.100'}
          py={2}
          px={4}
          borderRadius={'md'}
          cursor={'pointer'}
          userSelect={'none'}
          onClick={() => copyData(baseUrl, t('common:support.openapi.Copy success'))}
        >
          <Box border={theme.borders.md} px={2} borderRadius={'md'} fontSize={'xs'}>
            {t('common:support.openapi.Api baseurl')}
          </Box>
          <Box ml={2} fontSize={'sm'}>
            {baseUrl}
          </Box>
        </Flex>
        <Box mt={[2, 0]} textAlign={'right'}>
          <Button
            ml={3}
            leftIcon={<AddIcon fontSize={'md'} />}
            variant={'whitePrimary'}
            onClick={() =>
              setEditData({
                ...defaultEditData,
                appId
              })
            }
          >
            {t('common:new_create')}
          </Button>
        </Box>
      </Box>
      <TableContainer mt={3} position={'relative'} minH={'300px'}>
        <Table>
          <Thead>
            <Tr>
              <Th>{t('common:Name')}</Th>
              <Th>API key</Th>
              <Th>{t('common:support.outlink.Usage points')}</Th>
              {feConfigs?.isPlus && (
                <>
                  <Th>{t('common:expired_time')}</Th>
                </>
              )}

              <Th>{t('common:create_time')}</Th>
              <Th>{t('common:last_use_time')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {apiKeys.map(({ _id, name, usagePoints, limit, apiKey, createTime, lastUsedTime }) => (
              <Tr key={_id}>
                <Td>{name}</Td>
                <Td>{apiKey}</Td>
                <Td>
                  {Math.round(usagePoints)}/
                  {feConfigs?.isPlus && limit?.maxUsagePoints && limit?.maxUsagePoints > -1
                    ? `${limit?.maxUsagePoints}`
                    : t('common:Unlimited')}
                </Td>
                {feConfigs?.isPlus && (
                  <>
                    <Td whiteSpace={'pre-wrap'}>
                      {limit?.expiredTime
                        ? dayjs(limit?.expiredTime).format('YYYY/MM/DD\nHH:mm')
                        : '-'}
                    </Td>
                  </>
                )}
                <Td whiteSpace={'pre-wrap'}>{dayjs(createTime).format('YYYY/MM/DD\nHH:mm:ss')}</Td>
                <Td whiteSpace={'pre-wrap'}>
                  {lastUsedTime
                    ? dayjs(lastUsedTime).format('YYYY/MM/DD\nHH:mm:ss')
                    : t('common:un_used')}
                </Td>
                <Td>
                  <MyMenu
                    offset={[-50, 5]}
                    Button={
                      <IconButton
                        icon={<MyIcon name={'more'} w={'14px'} />}
                        name={'more'}
                        variant={'whitePrimary'}
                        size={'sm'}
                        aria-label={''}
                      />
                    }
                    menuList={[
                      {
                        children: [
                          {
                            label: t('common:Edit'),
                            icon: 'edit',
                            onClick: () =>
                              setEditData({
                                _id,
                                name,
                                limit,
                                appId
                              })
                          },
                          {
                            label: t('common:Delete'),
                            icon: 'delete',
                            type: 'danger',
                            onClick: () => openConfirm({ onConfirm: () => onclickRemove(_id) })()
                          }
                        ]
                      }
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {!!editData && (
        <EditKeyModal
          defaultData={editData}
          onClose={() => setEditData(undefined)}
          onCreate={(id) => {
            setApiKey(id);
            refetch();
            setEditData(undefined);
          }}
          onEdit={() => {
            refetch();
            setEditData(undefined);
          }}
        />
      )}
      <ConfirmModal />
      {!!showCallExampleModal && (
        <CallExampleModal
          app={appDetail}
          baseUrl={baseUrl}
          onClose={() => setShowCallExampleModal(false)}
        />
      )}
      <MyModal
        isOpen={!!apiKey}
        w={['400px', '600px']}
        iconSrc="keyPrimary"
        title={
          <Box>
            <Box fontWeight={'bold'}>{t('common:support.openapi.New api key')}</Box>
            <Box fontSize={'xs'} color={'myGray.600'}>
              {t('common:support.openapi.New api key tip')}
            </Box>
          </Box>
        }
        onClose={() => setApiKey('')}
      >
        <ModalBody pt={5}>
          <Flex
            bg={'myGray.100'}
            px={3}
            py={2}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-all'}
            cursor={'pointer'}
            borderRadius={'md'}
            userSelect={'all'}
            onClick={() => copyData(apiKey)}
          >
            <Box flex={1}>{apiKey}</Box>
            <MyIcon ml={1} name={'copy'} w={'16px'}></MyIcon>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={() => setApiKey('')}>
            {t('common:OK')}
          </Button>
        </ModalFooter>
      </MyModal>
    </MyBox>
  );
};

export default React.memo(ApiKeyTable);

// edit link modal
function EditKeyModal({
  defaultData,
  onClose,
  onCreate,
  onEdit
}: {
  defaultData: EditProps;
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = useMemo(() => !!defaultData._id, [defaultData]);
  const { feConfigs } = useSystemStore();

  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const { runAsync: onclickCreate, loading: creating } = useRequest(
    async (e: EditProps) => createAOpenApiKey(e),
    {
      errorToast: t('workflow:create_link_error'),
      onSuccess: onCreate
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest(
    (e: EditProps) => {
      //@ts-ignore
      return putOpenApiKey(e);
    },
    {
      errorToast: t('workflow:update_link_error'),
      onSuccess: onEdit
    }
  );

  return (
    <MyModal
      isOpen={true}
      iconSrc="keyPrimary"
      title={isEdit ? t('publish:edit_api_key') : t('publish:create_api_key')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <FormLabel flex={'0 0 90px'}>{t('common:Name')}</FormLabel>
          <Input
            placeholder={t('publish:key_alias') || 'key_alias'}
            maxLength={100}
            {...register('name', {
              required: t('common:name_is_empty') || 'name_is_empty'
            })}
          />
        </Flex>
        {feConfigs?.isPlus && (
          <>
            <Flex alignItems={'center'} mt={4}>
              <FormLabel display={'flex'} flex={'0 0 90px'} alignItems={'center'}>
                {t('common:support.outlink.Max usage points')}
                <QuestionTip
                  ml={1}
                  label={t('common:support.outlink.Max usage points tip')}
                ></QuestionTip>
              </FormLabel>
              <Input
                {...register('limit.maxUsagePoints', {
                  min: -1,
                  max: 10000000,
                  valueAsNumber: true,
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <FormLabel flex={'0 0 90px'}>{t('common:expired_time')}</FormLabel>
              <DateTimePicker
                value={
                  defaultData.limit?.expiredTime ? new Date(defaultData.limit.expiredTime) : null
                }
                onChange={(date) => {
                  setValue('limit.expiredTime', date || undefined);
                }}
              />
            </Flex>
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>

        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

// 根据变量类型获取示例值
function getVariableExampleValue(v: any, t: (key: string) => string): string {
  const type = v.type || v.valueType;

  const exampleMap: Record<string, string> = {
    input: t('common:support.openapi.example_input'),
    textarea: t('common:support.openapi.example_textarea'),
    numberInput: '123',
    select: t('common:support.openapi.example_select'),
    multipleSelect: t('common:support.openapi.example_multipleSelect'),
    switch: 'true',
    timePointSelect: '2024-01-01 10:00:00',
    timeRangeSelect: '["2024-01-01", "2024-01-31"]',
    password: t('common:support.openapi.example_password')
  };

  const typeKey = type
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');

  // 尝试找到匹配的类型
  for (const [key, value] of Object.entries(exampleMap)) {
    if (type === key || type.includes(key)) {
      return value;
    }
  }

  // 如果是select类型，返回第一个enum值
  if (type === VariableInputEnum.select || type === VariableInputEnum.multipleSelect) {
    return v.enums?.[0]?.value || exampleMap.select;
  }

  return t('common:support.openapi.example_default');
}

// 根据变量类型获取i18n key
function getVariableTypeI18nKey(v: any): string {
  const type = v.type || v.valueType;

  const typeI18nKeyMap: Record<string, string> = {
    [VariableInputEnum.input]: 'core.workflow.inputType.textInput',
    [VariableInputEnum.textarea]: 'core.workflow.inputType.textarea',
    [VariableInputEnum.numberInput]: 'core.workflow.inputType.number input',
    [VariableInputEnum.select]: 'core.workflow.inputType.select',
    [VariableInputEnum.multipleSelect]: 'core.workflow.inputType.multipleSelect',
    [VariableInputEnum.switch]: 'core.workflow.inputType.switch',
    [VariableInputEnum.timePointSelect]: 'core.workflow.inputType.timePointSelect',
    [VariableInputEnum.timeRangeSelect]: 'core.workflow.inputType.timeRangeSelect',
    [VariableInputEnum.password]: 'core.workflow.inputType.password',
    [VariableInputEnum.file]: 'core.workflow.inputType.file'
  };

  return typeI18nKeyMap[type] || '';
}

// 生成不带注释的 curl 命令（用于复制）
// 这个函数生成的命令用于【用户复制粘贴执行】，去除所有说明注释
// 用户点击"复制"按钮后，得到的是这个简洁版本，可直接在终端运行
function generateCurlCommandWithoutComments(
  app: AppDetailType | null,
  baseUrl: string,
  t: (key: string) => string
): string {
  // 确保使用 HTTPS 协议
  const secureBaseUrl = baseUrl.replace(/^http:/, 'https:');

  // 检查应用类型：assistant 类型不需要传变量
  const isAssistant = app?.type === AppTypeEnum.assistant;
  const variables = !isAssistant ? app?.chatConfig?.variables || [] : [];
  const hasVariables = variables.length > 0;

  // 检查应用是否支持文件上传
  const fileSelectConfig = app?.chatConfig?.fileSelectConfig;
  const canUploadFile =
    fileSelectConfig?.canSelectFile ||
    fileSelectConfig?.canSelectImg ||
    fileSelectConfig?.canSelectVideo ||
    fileSelectConfig?.canSelectAudio ||
    fileSelectConfig?.canSelectCustomFileExtension;

  const variablesExample = hasVariables
    ? `,
    "variables": {
${variables.map((v) => `      "${v.label}": "${getVariableExampleValue(v, t)}"`).join(',\n')}
    }`
    : '';

  // 生成文件示例（如果应用支持文件上传）
  const filesExample = canUploadFile
    ? `,
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "${t('common:support.openapi.example_text')}"
          },
          {
            "type": "file_url",
            "url": "https://your-s3-domain/xxx",
            "name": "document.pdf",
            "key": "chat-files/xxx"
          }
        ]
      }`
    : '';

  const appIdParam = app ? '' : '\n    "appId": "your_app_id",';

  return `curl '${secureBaseUrl}/v1/chat/completions' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{${appIdParam}
    "chatId": "",
    "stream": false,
    "detail": false,
    "messages": [
      {
        "role": "user",
        "content": "${t('common:support.openapi.content_text')}"
      }${filesExample}
    ]${variablesExample}
  }'`;
}

// 生成文件上传示例命令（无注释版本，用于复制）
function generateFileUploadCommand(
  app: AppDetailType | null,
  baseUrl: string,
  t: (key: string) => string
): string {
  const secureBaseUrl = baseUrl.replace(/^http:/, 'https:');
  const appId = app?._id || 'your_app_id';

  return `# ${t('common:support.openapi.file_upload_step1_desc')}
curl '${secureBaseUrl}/core/chat/file/presignChatFilePostUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "filename": "document.pdf",
    "appId": "${appId}",
    "chatId": "your_chat_id"
  }'

# ${t('common:support.openapi.file_upload_step2_desc')}
curl -X PUT '<url from step 1>' \\
  --data-binary @document.pdf \\
  -H 'x-amz-meta-content-disposition: <from step 1 headers>' \\
  -H 'x-amz-meta-origin-filename: <from step 1 headers>' \\
  -H 'x-amz-meta-upload-time: <from step 1 headers>'

# ${t('common:support.openapi.file_upload_step3_desc')}
curl '${secureBaseUrl}/core/chat/file/presignChatFileGetUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "key": "<key from step 1>",
    "appId": "${appId}"
  }'`;
}

// 调用示例弹窗组件
function CallExampleModal({
  app,
  baseUrl,
  onClose
}: {
  app: AppDetailType | null;
  baseUrl: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  // 检查应用是否支持文件上传
  const fileSelectConfig = app?.chatConfig?.fileSelectConfig;
  const canUploadFile =
    fileSelectConfig?.canSelectFile ||
    fileSelectConfig?.canSelectImg ||
    fileSelectConfig?.canSelectVideo ||
    fileSelectConfig?.canSelectAudio ||
    fileSelectConfig?.canSelectCustomFileExtension;

  // 展示和复制都使用无注释版本，保持一致
  const curlCommand = useMemo(
    () => generateCurlCommandWithoutComments(app, baseUrl, t),
    [app, baseUrl, t]
  );

  // 文件上传示例，展示和复制都使用无注释版本
  const fileUploadCommand = useMemo(() => {
    if (!canUploadFile) return '';
    return generateFileUploadCommand(app, baseUrl, t);
  }, [app, baseUrl, canUploadFile, t]);

  // 获取参数说明表格数据
  const paramDescription = useMemo(() => {
    const isAssistant = app?.type === AppTypeEnum.assistant;
    const variables = !isAssistant ? app?.chatConfig?.variables || [] : [];

    return {
      title: t('common:support.openapi.param_desc_title'),
      headers: [
        t('common:support.openapi.param_name'),
        t('common:support.openapi.param_required'),
        t('common:support.openapi.param_type'),
        t('common:support.openapi.param_description')
      ],
      baseParams: [
        [
          'chatId',
          t('common:support.openapi.param_optional'),
          'string',
          t('common:support.openapi.chatId_comment').replace(/^#\s*/, '')
        ],
        [
          'stream',
          t('common:support.openapi.param_optional'),
          'boolean',
          t('common:support.openapi.stream_comment').replace(/^#\s*/, '')
        ],
        [
          'detail',
          t('common:support.openapi.param_optional'),
          'boolean',
          t('common:support.openapi.detail_comment').replace(/^#\s*/, '')
        ],
        [
          'messages',
          t('common:support.openapi.param_required'),
          'array',
          t('common:support.openapi.content_comment').replace(/^#\s*/, '')
        ]
      ],
      appIdParam: app
        ? []
        : [
            [
              'appId',
              t('common:support.openapi.param_required'),
              'string',
              t('common:support.openapi.appId_comment').replace(/^#\s*/, '')
            ]
          ],
      variables: variables.map((v) => {
        const typeLabel = getVariableTypeI18nKey(v)
          ? t(`common:${getVariableTypeI18nKey(v)}`)
          : t('common:support.openapi.param_name');
        return [
          `variables.${v.label}`,
          v.required
            ? t('common:support.openapi.variable_required')
            : t('common:support.openapi.variable_optional'),
          typeLabel,
          v.description || ''
        ];
      }),
      fileUploadTitle: t('common:support.openapi.file_upload_process'),
      fileUploadHeaders: [
        t('common:support.openapi.step'),
        t('common:support.openapi.api_endpoint'),
        t('common:support.openapi.param_description')
      ],
      fileUploadParams: [
        [
          `${t('common:support.openapi.step')} 1`,
          'POST /core/chat/file/presignChatFilePostUrl',
          t('common:support.openapi.file_upload_step1_desc')
        ],
        [
          `${t('common:support.openapi.step')} 2`,
          'PUT <presigned-url>',
          t('common:support.openapi.file_upload_step2_desc')
        ],
        [
          `${t('common:support.openapi.step')} 3`,
          'POST /core/chat/file/presignChatFileGetUrl',
          t('common:support.openapi.file_upload_step3_desc')
        ]
      ]
    };
  }, [app, t]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="code"
      title={t('common:support.openapi.Call example')}
      maxW={['90vw', '900px']}
    >
      <ModalBody>
        <Box fontSize={'sm'} color={'myGray.600'} mb={3}>
          {t('common:support.openapi.Call example desc')}
        </Box>

        {/* 文件上传流程 */}
        {canUploadFile && (
          <>
            <Box fontSize={'sm'} color={'myGray.900'} fontWeight="bold" mt={4} mb={2}>
              {paramDescription.fileUploadTitle}
            </Box>

            {/* 文件上传流程说明表格 */}
            <TableContainer
              mb={3}
              borderRadius={'md'}
              border={'1px solid'}
              borderColor={'myGray.200'}
            >
              <Table size="sm" variant="simple">
                <Thead bg={'myGray.50'}>
                  <Tr>
                    {paramDescription.fileUploadHeaders.map((header, index) => (
                      <Th key={index} fontSize={'xs'}>
                        {header}
                      </Th>
                    ))}
                  </Tr>
                </Thead>
                <Tbody fontSize={'xs'}>
                  {paramDescription.fileUploadParams.map((row, rowIndex) => (
                    <Tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <Td key={cellIndex}>{cell}</Td>
                      ))}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>

            {/* SSL 证书注意事项 */}
            <Box
              mb={3}
              p={3}
              bg={'yellow.50'}
              borderRadius={'md'}
              border={'1px solid'}
              borderColor={'yellow.200'}
              fontSize={'xs'}
            >
              <Flex alignItems={'flex-start'}>
                <MyIcon
                  name={'common/error'}
                  w={'14px'}
                  h={'14px'}
                  color={'yellow.600'}
                  mt={'2px'}
                  mr={2}
                />
                <Box color={'yellow.900'}>{t('common:support.openapi.ssl_note')}</Box>
              </Flex>
            </Box>

            {/* 文件上传示例代码块 */}
            <Box
              my={3}
              borderRadius={'md'}
              overflow={'overlay'}
              boxShadow={
                '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)'
              }
            >
              <Flex
                className="code-header"
                py={2}
                px={5}
                bg={'myGray.600'}
                color={'white'}
                fontSize={'sm'}
                userSelect={'none'}
                justifyContent={'space-between'}
                alignItems={'center'}
              >
                <Box>bash</Box>
                <Flex
                  cursor={'pointer'}
                  onClick={() => copyData(fileUploadCommand, t('common:copy_successful'))}
                  alignItems={'center'}
                >
                  <MyIcon name={'copy'} w={'15px'} h={'15px'}></MyIcon>
                  <Box ml={1}>{t('common:Copy')}</Box>
                </Flex>
              </Flex>
              {/* 展示和复制内容保持一致，都使用无注释版本 */}
              <Box
                bg={'#1e1e1e'}
                p={4}
                overflow={'auto'}
                fontSize={'sm'}
                fontFamily={'monospace'}
                color={'#d4d4d4'}
                whiteSpace={'pre-wrap'}
                wordBreak={'break-word'}
              >
                {fileUploadCommand}
              </Box>
            </Box>
          </>
        )}

        {/* 对话调用 */}
        <Box fontSize={'sm'} color={'myGray.900'} fontWeight="bold" mt={4} mb={2}>
          {canUploadFile
            ? t('common:support.openapi.file_based_conversation')
            : t('common:support.openapi.conversation')}
        </Box>

        {/* 参数说明表格 */}
        <Box fontSize={'xs'} color={'myGray.900'} fontWeight="bold" mb={2}>
          {paramDescription.title}
        </Box>
        <TableContainer mb={3} borderRadius={'md'} border={'1px solid'} borderColor={'myGray.200'}>
          <Table size="sm" variant="simple">
            <Thead bg={'myGray.50'}>
              <Tr>
                {paramDescription.headers.map((header, index) => (
                  <Th key={index} fontSize={'xs'}>
                    {header}
                  </Th>
                ))}
              </Tr>
            </Thead>
            <Tbody fontSize={'xs'}>
              {[
                ...paramDescription.appIdParam,
                ...paramDescription.baseParams,
                ...paramDescription.variables
              ].map((row, rowIndex) => (
                <Tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <Td key={cellIndex}>{cell}</Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>

        {/* SSL 证书注意事项 */}
        <Box
          mb={3}
          p={3}
          bg={'yellow.50'}
          borderRadius={'md'}
          border={'1px solid'}
          borderColor={'yellow.200'}
          fontSize={'xs'}
        >
          <Flex alignItems={'flex-start'}>
            <MyIcon
              name={'common/error'}
              w={'14px'}
              h={'14px'}
              color={'yellow.600'}
              mt={'2px'}
              mr={2}
            />
            <Box color={'yellow.900'}>{t('common:support.openapi.ssl_note')}</Box>
          </Flex>
        </Box>

        {/* 对话调用示例代码块 */}
        <Box
          my={3}
          borderRadius={'md'}
          overflow={'overlay'}
          boxShadow={
            '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)'
          }
        >
          <Flex
            className="code-header"
            py={2}
            px={5}
            bg={'myGray.600'}
            color={'white'}
            fontSize={'sm'}
            userSelect={'none'}
            justifyContent={'space-between'}
            alignItems={'center'}
          >
            <Box>bash</Box>
            <Flex
              cursor={'pointer'}
              onClick={() => copyData(curlCommand, t('common:copy_successful'))}
              alignItems={'center'}
            >
              <MyIcon name={'copy'} w={'15px'} h={'15px'}></MyIcon>
              <Box ml={1}>{t('common:Copy')}</Box>
            </Flex>
          </Flex>
          {/* 展示和复制内容保持一致，都使用无注释版本 */}
          <Box
            bg={'#1e1e1e'}
            p={4}
            overflow={'auto'}
            fontSize={'sm'}
            fontFamily={'monospace'}
            color={'#d4d4d4'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-word'}
          >
            {curlCommand}
          </Box>
        </Box>
      </ModalBody>
    </MyModal>
  );
}
