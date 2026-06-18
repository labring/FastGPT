import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
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
  IconButton,
  Switch
} from '@chakra-ui/react';
import {
  getOpenApiKeys,
  createAOpenApiKey,
  delOpenApiById,
  putOpenApiKey,
  copyOpenApiKey
} from '@/web/support/openapi/api';
import type { EditApiKeyProps } from '@/global/support/openapi/api';
import dayjs from 'dayjs';
import { AddIcon } from '@chakra-ui/icons';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModalV2 from '@fastgpt/web/components/v2/common/MyModal';
import { Controller, useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getDocPath } from '@/web/common/system/doc';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyBox from '@fastgpt/web/components/common/MyBox';

type EditProps = EditApiKeyProps & { _id?: string };
const defaultEditData: EditProps = {
  name: '',
  authProxy: false,
  limit: {
    maxUsagePoints: -1
  }
};

const maskApiKey = (apiKey: string) => {
  if (apiKey.startsWith('******')) return apiKey;
  return `******${apiKey.slice(-4)}`;
};

type ApiKeyTableProps = {
  tips: string;
  appId?: string;
  mode?: 'account' | 'publish';
};

const ApiKeyTable = ({ tips, appId, mode = 'account' }: ApiKeyTableProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();
  const isPublishMode = mode === 'publish';
  const baseUrl =
    feConfigs?.customApiDomain || (typeof location !== 'undefined' ? `${location.origin}/api` : '');
  const [editData, setEditData] = useState<EditProps>();
  const [apiKey, setApiKey] = useState('');
  const [copyingApiKeyId, setCopyingApiKeyId] = useState<string>();

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: t('common:delete_api')
  });

  const { runAsync: onclickRemove } = useRequest(delOpenApiById, {
    onSuccess() {
      refetch();
    }
  });
  const { runAsync: copyApiKey } = useRequest(copyOpenApiKey, {
    errorToast: 'Error'
  });

  const onCopyApiKey = async (id: string) => {
    setCopyingApiKeyId(id);
    try {
      const plainApiKey = await copyApiKey({ id });
      await copyData(plainApiKey);
    } finally {
      setCopyingApiKeyId(undefined);
    }
  };

  const {
    data: apiKeys = [],
    loading: isGetting,
    run: refetch
  } = useRequest(() => getOpenApiKeys({ appId }), {
    manual: false,
    refreshDeps: [appId]
  });

  return (
    <MyBox
      isLoading={isGetting}
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      position={'relative'}
      pt={isPublishMode ? 3 : 0}
      px={isPublishMode ? 5 : 0}
      minH={isPublishMode ? '50vh' : undefined}
    >
      <Box display={['block', 'flex']} alignItems={'center'}>
        <Box flex={1}>
          <Flex alignItems={'center'}>
            <Box
              color={'myGray.900'}
              fontSize={isPublishMode ? ['md', 'lg'] : 'lg'}
              fontWeight={isPublishMode ? 'bold' : 'normal'}
            >
              {t('common:support.openapi.Api manager')}
            </Box>
            {feConfigs?.docUrl && (
              <Link
                href={feConfigs.openAPIDocUrl || getDocPath('/openapi/intro')}
                target={'_blank'}
                ml={isPublishMode ? 2 : 1}
                color={'primary.500'}
                fontSize={'sm'}
              >
                {isPublishMode ? (
                  <Flex alignItems={'center'}>
                    <MyIcon name="book" w={'17px'} h={'17px'} mr="1" />
                    {t('common:read_doc')}
                  </Flex>
                ) : (
                  t('common:read_doc')
                )}
              </Link>
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
            variant={isPublishMode ? 'primary' : 'whitePrimary'}
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
              <Th>API KEY</Th>
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
            {apiKeys.map(
              ({
                _id,
                name,
                usagePoints,
                limit,
                apiKey,
                canCopy,
                createTime,
                lastUsedTime,
                authProxy
              }) => (
                <Tr key={_id}>
                  <Td>{name}</Td>
                  <Td>
                    <Flex alignItems={'center'} gap={2}>
                      <Box>{maskApiKey(apiKey)}</Box>
                      {canCopy && (
                        <IconButton
                          aria-label={t('common:Copy')}
                          icon={<MyIcon name={'copy'} w={'15px'} />}
                          size={'xs'}
                          variant={'whiteBase'}
                          isLoading={copyingApiKeyId === _id}
                          onClick={() => onCopyApiKey(_id)}
                        />
                      )}
                    </Flex>
                  </Td>
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
                  <Td whiteSpace={'pre-wrap'}>
                    {dayjs(createTime).format('YYYY/MM/DD\nHH:mm:ss')}
                  </Td>
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
                                  authProxy,
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
              )
            )}
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
      <MyModalV2
        isOpen={!!apiKey}
        title={
          <Box>
            <Box fontWeight={'bold'}>{t('common:support.openapi.New api key')}</Box>
            <Box fontSize={'xs'} color={'myGray.600'}>
              {t('common:support.openapi.New api key tip')}
            </Box>
          </Box>
        }
        size="md"
        onClose={() => setApiKey('')}
        footer={
          <Button variant="whiteBase" onClick={() => setApiKey('')}>
            {t('common:OK')}
          </Button>
        }
      >
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
      </MyModalV2>
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
    control,
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm<EditProps>({
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
    <MyModalV2
      isOpen={true}
      title={isEdit ? t('publish:edit_api_key') : t('publish:create_api_key')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>

          <Button
            isLoading={creating || updating}
            onClick={submitShareChat((data) =>
              isEdit ? onclickUpdate(data) : onclickCreate(data)
            )}
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Flex flexDirection={'column'} gap={4}>
        <Flex alignItems={'center'} gap={4}>
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
            <Flex alignItems={'center'} gap={4}>
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
            <Flex alignItems={'center'} gap={4}>
              <FormLabel flex={'0 0 90px'}>{t('common:expired_time')}</FormLabel>
              <Input
                type="datetime-local"
                defaultValue={
                  defaultData.limit?.expiredTime
                    ? dayjs(defaultData.limit?.expiredTime).format('YYYY-MM-DDTHH:mm')
                    : ''
                }
                onChange={(e) => {
                  setValue('limit.expiredTime', new Date(e.target.value));
                }}
              />
            </Flex>
          </>
        )}
        {!defaultData.appId && (
          <Flex alignItems={'center'} mt={4}>
            <FormLabel display={'flex'} flex={'0 0 90px'} alignItems={'center'}>
              {t('common:support.openapi.Auth proxy')}
              <QuestionTip ml={1} label={t('common:support.openapi.Auth proxy tip')}></QuestionTip>
            </FormLabel>
            <Controller
              control={control}
              name="authProxy"
              render={({ field }) => (
                <Switch
                  isChecked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
              )}
            />
          </Flex>
        )}
      </Flex>
    </MyModalV2>
  );
}
