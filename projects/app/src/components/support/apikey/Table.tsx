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
          <Flex alignItems={'flex-end'}>
            <Box color={'myGray.900'} fontSize={'lg'}>
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
                  ml={1}
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

// 获取当前语言的curl命令模板
// 这个函数返回的模板用于两个场景：
// 1. 前端展示（带注释版本）：用于在UI中显示给用户查看，包含详细的中文/英文说明注释
// 2. 复制粘贴用（无注释版本）：用户复制后在终端直接执行，去除了所有说明注释
function getCurlCommandTemplate(locale: string) {
  const templates = {
    'zh-CN': {
      // ========== 前端展示用的字段 ==========
      // 以下字段用于 generateCurlCommandWithComments() 函数，生成带详细注释的版本用于前端展示
      title: '# FastGPT API 调用示例',
      replaceKey: '# 请将 YOUR_API_KEY 替换为您的 API Key',
      application: '# 应用: ',
      // fileUploadHeader: 带注释的文件上传流程说明（前端展示）
      fileUploadHeader: `
# ========== 文件上传流程说明 ==========
# 1. 先调用文件上传接口获取预签名URL:
#    POST {baseUrl}/core/chat/file/presignChatFilePostUrl
#    请求体: { "filename": "document.pdf", "appId": "<实际应用ID>", "chatId": "your_chat_id" }
#    返回: { "url": "...", "key": "...", "headers": {...} }

curl '{baseUrl}/core/chat/file/presignChatFilePostUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "filename": "document.pdf",
    "appId": "{appId}",
    "chatId": "your_chat_id"
  }'

# 2. 用返回的URL直接上传文件到S3:
#    PUT <presigned-url> --data-binary @document.pdf -H 'Authorization: Bearer ...' ...
#    需要使用第1步返回的headers: x-amz-meta-content-disposition, x-amz-meta-origin-filename, x-amz-meta-upload-time

curl -X PUT '<url from step 1>' \\
  --data-binary @document.pdf \\
  -H 'x-amz-meta-content-disposition: <from step 1 headers>' \\
  -H 'x-amz-meta-origin-filename: <from step 1 headers>' \\
  -H 'x-amz-meta-upload-time: <from step 1 headers>'

# 3. 再调用获取文件访问URL接口（使用第1步返回的key）:
#    POST {baseUrl}/core/chat/file/presignChatFileGetUrl
#    请求体: { "key": "<第1步返回的key>", "appId": "<实际应用ID>" }
#    返回: 文件访问URL (用于下面的messages中)

curl '{baseUrl}/core/chat/file/presignChatFileGetUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "key": "<key from step 1>",
    "appId": "{appId}"
  }'

# ====================================`,
      fileUploadCurlWithoutComments: `# Step 1: Get presigned URL for file upload
curl '{baseUrl}/core/chat/file/presignChatFilePostUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "filename": "document.pdf",
    "appId": "{appId}",
    "chatId": "your_chat_id"
  }'

# Step 2: Upload file to S3 (use the url and headers from step 1)
curl -X PUT '<url from step 1>' \\
  --data-binary @document.pdf \\
  -H 'x-amz-meta-content-disposition: <from step 1 headers>' \\
  -H 'x-amz-meta-origin-filename: <from step 1 headers>' \\
  -H 'x-amz-meta-upload-time: <from step 1 headers>'

# Step 3: Get file access URL (use the key from step 1)
curl '{baseUrl}/core/chat/file/presignChatFileGetUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "key": "<key from step 1>",
    "appId": "{appId}"
  }'`,
      curleample: `
curl '{baseUrl}/v1/chat/completions' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
{appIdParam}    "chatId": "",  # 可选，用于多轮对话，传入上次对话的 chatId
    "stream": false,  # 是否流式返回，true 表示流式返回
    "detail": false,  # 是否返回详细信息
    "messages": [
      {
        "role": "user",  # 角色：user 表示用户消息
        "content": "你好，请介绍一下自己"  # 用户的问题
      }{filesExample}
    ]{variablesExample}
  }'`,
      messageWithFileComment: '# 【可选】包含文件的消息（文件不是必填的，可以只发送文本）',
      textTypeComment: '# 文本内容',
      fileTypeComment: '# 文件内容',
      fileTypeFieldComment: '# 文件类型: image 或 file',
      urlComment: '# 文件访问URL（通过presignChatFileGetUrl接口获取）',
      nameComment: '# 文件名',
      keyComment: '# S3文件key（presignChatFilePostUrl接口返回，第1步返回）',
      exampleText: '请帮我分析这个文件',
      appIdComment: '# 必填，指定要调用的应用ID'
    },
    'zh-Hant': {
      title: '# FastGPT API 呼叫示例',
      replaceKey: '# 請將 YOUR_API_KEY 替換為您的 API Key',
      application: '# 應用: ',
      fileUploadHeader: `
# ========== 文件上傳流程說明 ==========
# 1. 先呼叫文件上傳接口獲取預簽名URL:
#    POST {baseUrl}/core/chat/file/presignChatFilePostUrl
#    請求體: { "filename": "document.pdf", "appId": "<實際應用ID>", "chatId": "your_chat_id" }
#    返回: { "url": "...", "key": "...", "headers": {...} }

curl '{baseUrl}/core/chat/file/presignChatFilePostUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "filename": "document.pdf",
    "appId": "{appId}",
    "chatId": "your_chat_id"
  }'

# 2. 用返回的URL直接上傳文件到S3:
#    PUT <presigned-url> --data-binary @document.pdf -H 'Authorization: Bearer ...' ...
#    需要使用第1步返回的headers: x-amz-meta-content-disposition, x-amz-meta-origin-filename, x-amz-meta-upload-time

curl -X PUT '<url from step 1>' \\
  --data-binary @document.pdf \\
  -H 'x-amz-meta-content-disposition: <from step 1 headers>' \\
  -H 'x-amz-meta-origin-filename: <from step 1 headers>' \\
  -H 'x-amz-meta-upload-time: <from step 1 headers>'

# 3. 再呼叫獲取文件訪問URL接口（使用第1步返回的key）:
#    POST {baseUrl}/core/chat/file/presignChatFileGetUrl
#    請求體: { "key": "<第1步返回的key>", "appId": "<實際應用ID>" }
#    返回: 文件訪問URL (用於下面的messages中)

curl '{baseUrl}/core/chat/file/presignChatFileGetUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "key": "<key from step 1>",
    "appId": "{appId}"
  }'

# ====================================`,
      fileUploadCurlWithoutComments: `# Step 1: Get presigned URL for file upload
curl '{baseUrl}/core/chat/file/presignChatFilePostUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "filename": "document.pdf",
    "appId": "{appId}",
    "chatId": "your_chat_id"
  }'

# Step 2: Upload file to S3 (use the url and headers from step 1)
curl -X PUT '<url from step 1>' \\
  --data-binary @document.pdf \\
  -H 'x-amz-meta-content-disposition: <from step 1 headers>' \\
  -H 'x-amz-meta-origin-filename: <from step 1 headers>' \\
  -H 'x-amz-meta-upload-time: <from step 1 headers>'

# Step 3: Get file access URL (use the key from step 1)
curl '{baseUrl}/core/chat/file/presignChatFileGetUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "key": "<key from step 1>",
    "appId": "{appId}"
  }'`,
      curleample: `
curl '{baseUrl}/v1/chat/completions' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
{appIdParam}    "chatId": "",  # 可選，用於多輪對話，傳入上次對話的 chatId
    "stream": false,  # 是否流式返回，true 表示流式返回
    "detail": false,  # 是否返回詳細信息
    "messages": [
      {
        "role": "user",  # 角色：user 表示用戶消息
        "content": "你好，請介紹一下自己"  # 用戶的問題
      }{filesExample}
    ]{variablesExample}
  }'`,
      messageWithFileComment: '# 【可選】包含文件的消息（文件不是必填的，可以只發送文本）',
      textTypeComment: '# 文本內容',
      fileTypeComment: '# 文件內容',
      fileTypeFieldComment: '# 文件類型: image 或 file',
      urlComment: '# 文件訪問URL（通過presignChatFileGetUrl接口獲取）',
      nameComment: '# 文件名',
      keyComment: '# S3文件key（presignChatFilePostUrl接口返回，第1步返回）',
      exampleText: '請幫我分析這個文件',
      appIdComment: '# 必填，指定要呼叫的應用ID'
    },
    en: {
      title: '# FastGPT API Call Example',
      replaceKey: '# Replace YOUR_API_KEY with your API Key',
      application: '# Application: ',
      fileUploadHeader: `
# ========== File Upload Process ==========
# 1. Call the file upload interface to get presigned URL:
#    POST {baseUrl}/core/chat/file/presignChatFilePostUrl
#    Request body: { "filename": "document.pdf", "appId": "<actual app ID>", "chatId": "your_chat_id" }
#    Response: { "url": "...", "key": "...", "headers": {...} }

curl '{baseUrl}/core/chat/file/presignChatFilePostUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "filename": "document.pdf",
    "appId": "{appId}",
    "chatId": "your_chat_id"
  }'

# 2. Upload the file directly to S3 using the returned URL:
#    PUT <presigned-url> --data-binary @document.pdf -H 'Authorization: Bearer ...' ...
#    Use the headers from step 1: x-amz-meta-content-disposition, x-amz-meta-origin-filename, x-amz-meta-upload-time

curl -X PUT '<url from step 1>' \\
  --data-binary @document.pdf \\
  -H 'x-amz-meta-content-disposition: <from step 1 headers>' \\
  -H 'x-amz-meta-origin-filename: <from step 1 headers>' \\
  -H 'x-amz-meta-upload-time: <from step 1 headers>'

# 3. Call the get file access URL interface (use the key from step 1):
#    POST {baseUrl}/core/chat/file/presignChatFileGetUrl
#    Request body: { "key": "<key from step 1>", "appId": "<actual app ID>" }
#    Response: File access URL (used in messages below)

curl '{baseUrl}/core/chat/file/presignChatFileGetUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "key": "<key from step 1>",
    "appId": "{appId}"
  }'

# ==========================================`,
      fileUploadCurlWithoutComments: `# Step 1: Get presigned URL for file upload
curl '{baseUrl}/core/chat/file/presignChatFilePostUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "filename": "document.pdf",
    "appId": "{appId}",
    "chatId": "your_chat_id"
  }'

# Step 2: Upload file to S3 (use the url and headers from step 1)
curl -X PUT '<url from step 1>' \\
  --data-binary @document.pdf \\
  -H 'x-amz-meta-content-disposition: <from step 1 headers>' \\
  -H 'x-amz-meta-origin-filename: <from step 1 headers>' \\
  -H 'x-amz-meta-upload-time: <from step 1 headers>'

# Step 3: Get file access URL (use the key from step 1)
curl '{baseUrl}/core/chat/file/presignChatFileGetUrl' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "key": "<key from step 1>",
    "appId": "<actual app ID>"
  }'`,
      curleample: `
curl '{baseUrl}/v1/chat/completions' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
{appIdParam}    "chatId": "",  # Optional, used for multi-turn conversations, pass the chatId from the last conversation
    "stream": false,  # Whether to return in streaming mode, true for streaming
    "detail": false,  # Whether to return detailed information
    "messages": [
      {
        "role": "user",  # Role: user represents user message
        "content": "Hello, please introduce yourself"  # User question
      }{filesExample}
    ]{variablesExample}
  }'`,
      messageWithFileComment:
        '# [Optional] Message containing a file (file is optional, text-only messages are also supported)',
      textTypeComment: '# Text content',
      fileTypeComment: '# File content',
      fileTypeFieldComment: '# File type: image or file',
      urlComment: '# File access URL (obtained via presignChatFileGetUrl interface)',
      nameComment: '# File name',
      keyComment: '# S3 file key (returned by presignChatFilePostUrl interface, step 1)',
      exampleText: 'Please help me analyze this file',
      appIdComment: '# Required, specify the application ID to call'
    }
  };

  return templates[locale as keyof typeof templates] || templates['zh-CN'];
}

// 生成带注释的 curl 命令
// 这个函数生成的命令用于【前端UI展示】，包含详细的中文/英文说明注释
// 用户在UI中看到的是这个版本，便于理解每个参数的含义
function generateCurlCommandWithComments(
  app: AppDetailType | null,
  baseUrl: string,
  t: any,
  locale: string = 'zh-CN'
): string {
  const tpl = getCurlCommandTemplate(locale);
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

  // 生成变量示例（带注释）
  const variablesExample = hasVariables
    ? `,
    "variables": {
${variables
  .map((v) => {
    const i18nKey = getVariableTypeI18nKey(v);
    const typeLabel = i18nKey ? t(`common:${i18nKey}`) : '参数';
    const requiredLabel =
      locale === 'en'
        ? v.required
          ? 'Required'
          : 'Optional'
        : locale === 'zh-Hant'
          ? v.required
            ? '必填'
            : '可選'
          : v.required
            ? '必填'
            : '可选';
    const descLabel = v.description || '';
    return `      "${v.label}": "${getVariableExampleValue(v, locale)}"  # ${typeLabel} (${requiredLabel}) - ${descLabel}`;
  })
  .join(',\n')}
    }`
    : '';

  // 生成文件示例（如果应用支持文件上传）
  const filesExample = canUploadFile
    ? `,
      {
        "role": "user",  ${tpl.messageWithFileComment}
        "content": [
          {
            "type": "text",  ${tpl.textTypeComment}
            "text": "${tpl.exampleText}"
          },
          {
            "type": "file_url",  ${tpl.fileTypeComment}
            "url": "https://your-s3-domain/xxx",  ${tpl.urlComment}
            "name": "document.pdf",  ${tpl.nameComment}
            "key": "chat-files/xxx"  ${tpl.keyComment}
          }
        ]
      }`
    : '';

  const appName = app ? `\n${tpl.application}${app.name}` : '';
  const appIdParam = app ? '' : `\n    "appId": "your_app_id",  ${tpl.appIdComment}`;

  let curlCommand = `${tpl.title}${appName}
${tpl.replaceKey}`;

  // 注意：文件上传说明已在单独的区域展示，这里不再重复添加
  // if (canUploadFile) {
  //   curlCommand += tpl.fileUploadHeader
  //     .replace(/{baseUrl}/g, secureBaseUrl)
  //     .replace(/{appId}/g, app?._id || 'your_app_id');
  // }

  curlCommand += tpl.curleample
    .replace(/{baseUrl}/g, secureBaseUrl)
    .replace(/{appIdParam}/g, appIdParam)
    .replace(/{filesExample}/g, filesExample)
    .replace(/{variablesExample}/g, variablesExample);

  return curlCommand;
}

// 生成不带注释的 curl 命令（用于复制）
// 这个函数生成的命令用于【用户复制粘贴执行】，去除所有说明注释
// 用户点击"复制"按钮后，得到的是这个简洁版本，可直接在终端运行
function generateCurlCommandWithoutComments(
  app: AppDetailType | null,
  baseUrl: string,
  locale: string = 'zh-CN'
): string {
  const tpl = getCurlCommandTemplate(locale);
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
${variables.map((v) => `      "${v.label}": "${getVariableExampleValue(v, locale)}"`).join(',\n')}
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
            "text": "${tpl.exampleText}"
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
  const contentText =
    locale === 'en'
      ? 'Hello, please introduce yourself'
      : locale === 'zh-Hant'
        ? '你好，請介紹一下自己'
        : '你好，请介绍一下自己';

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
        "content": "${contentText}"
      }${filesExample}
    ]${variablesExample}
  }'`;
}

// 根据变量类型获取示例值
function getVariableExampleValue(v: any, locale: string = 'zh-CN'): string {
  const type = v.type || v.valueType;

  const exampleMap: Record<string, Record<string, string>> = {
    'zh-CN': {
      input: '文本示例',
      textarea: '文本示例',
      numberInput: '123',
      select: '选项1',
      multipleSelect: '["选项1", "选项2"]',
      switch: 'true',
      timePointSelect: '2024-01-01 10:00:00',
      timeRangeSelect: '["2024-01-01", "2024-01-31"]',
      password: '密码示例'
    },
    'zh-Hant': {
      input: '文字示例',
      textarea: '文字示例',
      numberInput: '123',
      select: '選項1',
      multipleSelect: '["選項1", "選項2"]',
      switch: 'true',
      timePointSelect: '2024-01-01 10:00:00',
      timeRangeSelect: '["2024-01-01", "2024-01-31"]',
      password: '密碼示例'
    },
    en: {
      input: 'text example',
      textarea: 'text example',
      numberInput: '123',
      select: 'option1',
      multipleSelect: '["option1", "option2"]',
      switch: 'true',
      timePointSelect: '2024-01-01 10:00:00',
      timeRangeSelect: '["2024-01-01", "2024-01-31"]',
      password: 'password example'
    }
  };

  const localeExamples = exampleMap[locale] || exampleMap['zh-CN'];
  const typeKey = type
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');

  // 尝试找到匹配的类型
  for (const [key, value] of Object.entries(localeExamples)) {
    if (type === key || type.includes(key)) {
      return value;
    }
  }

  // 如果是select类型，返回第一个enum值
  if (type === VariableInputEnum.select || type === VariableInputEnum.multipleSelect) {
    return v.enums?.[0]?.value || localeExamples.select;
  }

  return locale === 'en' ? 'example' : locale === 'zh-Hant' ? '示例值' : '示例值';
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

// 调用示例弹窗组件
// 该组件展示 API 调用示例，包含两套命令：
// 1. 【前端展示】curlWithComments & fileUploadExample - 带详细注释版本，显示在UI中便于用户理解
// 2. 【复制粘贴】curlWithoutComments & fileUploadExampleWithoutComments - 无注释简洁版本，
//                 用户点击"复制"按钮后得到这个版本，可直接在终端运行
// 工作流程：
// - UI显示：curlWithComments（前端展示版）
// - 复制动作：copyData(curlWithoutComments)（复制粘贴版）
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
  const { i18n } = useTranslation();
  const { copyData } = useCopyData();

  // 检查应用是否支持文件上传
  const fileSelectConfig = app?.chatConfig?.fileSelectConfig;
  const canUploadFile =
    fileSelectConfig?.canSelectFile ||
    fileSelectConfig?.canSelectImg ||
    fileSelectConfig?.canSelectVideo ||
    fileSelectConfig?.canSelectAudio ||
    fileSelectConfig?.canSelectCustomFileExtension;

  const curlWithComments = useMemo(
    () => generateCurlCommandWithComments(app, baseUrl, t, i18n.language),
    [app, baseUrl, t, i18n.language]
  );

  // 【复制粘贴用】不带注释的curl命令，用户复制后可直接在终端执行
  const curlWithoutComments = useMemo(
    () => generateCurlCommandWithoutComments(app, baseUrl, i18n.language),
    [app, baseUrl, i18n.language]
  );

  // 生成独立的文件上传示例
  // fileUploadExample: 【前端展示用】带详细注释的文件上传流程（显示在UI中）
  // fileUploadExampleWithoutComments: 【复制粘贴用】简洁版本（用户点击复制按钮）
  const fileUploadExample = useMemo(() => {
    if (!canUploadFile) return '';

    // 确保使用 HTTPS 协议
    const secureBaseUrl = baseUrl.replace(/^http:/, 'https:');
    const tpl = getCurlCommandTemplate(i18n.language);

    return tpl.fileUploadHeader
      .replace(/{baseUrl}/g, secureBaseUrl)
      .replace(/{appId}/g, app?._id || 'your_app_id');
  }, [app, baseUrl, canUploadFile, i18n.language]);

  const fileUploadExampleWithoutComments = useMemo(() => {
    if (!canUploadFile) return '';

    // 确保使用 HTTPS 协议
    const secureBaseUrl = baseUrl.replace(/^http:/, 'https:');
    const tpl = getCurlCommandTemplate(i18n.language);

    return tpl.fileUploadCurlWithoutComments
      .replace(/{baseUrl}/g, secureBaseUrl)
      .replace(/{appId}/g, app?._id || 'your_app_id');
  }, [app, baseUrl, canUploadFile, i18n.language]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="code"
      title={t('common:support.openapi.Call example')}
      maxW={['90vw', '800px']}
    >
      <ModalBody>
        <Box fontSize={'sm'} color={'myGray.600'} mb={3}>
          {t('common:support.openapi.Call example desc')}
        </Box>

        {/* 文件上传示例代码块：【前端展示】带注释版本 */}
        {canUploadFile && (
          <>
            <Box fontSize={'sm'} color={'myGray.900'} fontWeight="bold" mt={4} mb={2}>
              {t('common:upload_file')}
            </Box>
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
                {/* 复制按钮触发 fileUploadExampleWithoutComments（无注释版本）的复制 */}
                <Flex
                  cursor={'pointer'}
                  onClick={() =>
                    copyData(
                      fileUploadExampleWithoutComments,
                      t('common:support.openapi.Copy success')
                    )
                  }
                  alignItems={'center'}
                >
                  <MyIcon name={'copy'} w={'15px'} h={'15px'}></MyIcon>
                  <Box ml={1}>{t('common:Copy')}</Box>
                </Flex>
              </Flex>
              {/* 显示带注释的版本 fileUploadExample（便于用户理解） */}
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
                {fileUploadExample}
              </Box>
            </Box>
          </>
        )}

        {/* 对话调用示例代码块：【前端展示】带注释版本 */}
        <Box fontSize={'sm'} color={'myGray.900'} fontWeight="bold" mt={4} mb={2}>
          {canUploadFile
            ? i18n.language === 'en'
              ? 'File-based Conversation'
              : i18n.language === 'zh-Hant'
                ? '基於文件對話'
                : '基于文件对话'
            : i18n.language === 'en'
              ? 'Conversation'
              : i18n.language === 'zh-Hant'
                ? '對話'
                : '对话'}
        </Box>
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
            {/* 复制按钮触发 curlWithoutComments（无注释版本）的复制 */}
            <Flex
              cursor={'pointer'}
              onClick={() =>
                copyData(curlWithoutComments, t('common:support.openapi.Copy success'))
              }
              alignItems={'center'}
            >
              <MyIcon name={'copy'} w={'15px'} h={'15px'}></MyIcon>
              <Box ml={1}>{t('common:Copy')}</Box>
            </Flex>
          </Flex>
          {/* 显示带注释的版本 curlWithComments（便于用户理解各个参数） */}
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
            {curlWithComments}
          </Box>
        </Box>
      </ModalBody>
    </MyModal>
  );
}
