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
  copyOpenApiKey,
  getOpenApiTags,
  createOpenApiTag
} from '@/web/support/openapi/api';
import type { EditApiKeyProps } from '@/global/support/openapi/api';
import type { ApiKeyListSortByType } from '@fastgpt/global/openapi/support/openapi/api';
import type { OpenApiTagType } from '@fastgpt/global/openapi/support/openapi/tag';
import dayjs from 'dayjs';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModalV2 from '@fastgpt/web/components/v2/common/MyModal';
import { Controller, useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getDocPath } from '@/web/common/system/doc';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { SingleSelectFilter } from '@fastgpt/web/components/common/TagFilter';
import TagDisplayList, { type ApiKeyDisplayTag } from './TagDisplayList';
import {
  accountContentScrollStyles,
  accountPageRootStyles,
  accountTitleTextStyles
} from '@/pageComponents/account/styles';
import TagMultiSelect from './TagMultiSelect';
import TagManageModal from './TagManageModal';
import { useDebounce } from 'ahooks';

type EditProps = EditApiKeyProps & { _id?: string };
const defaultEditData: EditProps = {
  name: '',
  authProxy: false,
  limit: {
    maxUsagePoints: -1
  }
};

const getDefaultEditData = (): EditProps => ({
  name: defaultEditData.name,
  authProxy: defaultEditData.authProxy,
  tags: [],
  limit: {
    maxUsagePoints: defaultEditData.limit?.maxUsagePoints ?? -1,
    expiredTime: defaultEditData.limit?.expiredTime
  }
});

const maskApiKey = (apiKey: string) => {
  if (apiKey.startsWith('******')) return apiKey;
  return `******${apiKey.slice(-4)}`;
};

type ApiKeyTableProps = {
  mode?: 'account' | 'publish';
  appId?: string;
};

const apiKeyTableFields = [
  'name',
  'apiKey',
  'usagePoints',
  'expiredTime',
  'lastUsedTime',
  'createTime',
  'actions'
] as const;
type ApiKeyTableField = (typeof apiKeyTableFields)[number];

const isSameTagIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
};

const ApiKeyTagEditor = ({
  apiKeyId,
  appName,
  tagIds,
  allTags,
  onSave,
  onManage,
  onCreateTag,
  isLoading
}: {
  apiKeyId: string;
  appName?: string;
  tagIds: string[];
  allTags: OpenApiTagType[];
  onSave: (apiKeyId: string, tagIds: string[]) => Promise<void>;
  onManage: () => void;
  onCreateTag: (name: string) => Promise<OpenApiTagType | void>;
  isLoading: boolean;
}) => {
  const [localTagIds, setLocalTagIds] = useState(tagIds);

  const selectedTags = useMemo(
    () => localTagIds.flatMap((id) => allTags.find((tag) => tag._id === id) || []),
    [allTags, localTagIds]
  );
  const displayTags = useMemo<ApiKeyDisplayTag[]>(
    () => [
      ...(appName
        ? [
            {
              _id: `appName-${apiKeyId}`,
              name: appName,
              isAppName: true
            }
          ]
        : []),
      ...selectedTags
    ],
    [apiKeyId, appName, selectedTags]
  );

  if (displayTags.length === 0) {
    return null;
  }

  return (
    <TagMultiSelect
      tags={allTags}
      value={localTagIds}
      onChange={setLocalTagIds}
      onManage={onManage}
      onCreateTag={onCreateTag}
      isLoading={isLoading}
      placement="bottom-start"
      popoverW="180px"
      renderTrigger={({ openSelector }) => (
        <Box
          mt={1}
          py={0.5}
          px={0.25}
          w={'100%'}
          maxW={'100%'}
          cursor={'pointer'}
          _hover={{
            bg: 'myGray.50',
            borderRadius: '3px'
          }}
          onClick={(e) => {
            e.stopPropagation();
            if ((e.target as HTMLElement).closest('[data-api-key-overflow-tags]')) {
              return;
            }
            openSelector();
          }}
        >
          <TagDisplayList tags={displayTags} />
        </Box>
      )}
      onClose={(nextTagIds) => {
        if (!isSameTagIds(nextTagIds, tagIds)) {
          return onSave(apiKeyId, nextTagIds);
        }
      }}
    />
  );
};

const ApiKeyTable = ({ mode = 'account', appId }: ApiKeyTableProps) => {
  const { t } = useClientTranslation(['apikey', 'account']);
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();
  const isPublishMode = mode === 'publish';
  const hasUsagePlan = !!feConfigs?.isPlus;
  const baseUrl =
    feConfigs?.customApiDomain || (typeof location !== 'undefined' ? `${location.origin}/api` : '');
  const [editData, setEditData] = useState<EditProps>();
  const [apiKey, setApiKey] = useState('');
  const [copyingApiKeyId, setCopyingApiKeyId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const requestKeyword = useDebounce(keyword.trim(), { wait: 300 });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<ApiKeyListSortByType>('createTime');
  const effectiveSortBy = hasUsagePlan || sortBy !== 'remainingPoints' ? sortBy : 'createTime';
  const [showTagManage, setShowTagManage] = useState(false);
  const sortOptions = useMemo<
    {
      label: string;
      value: ApiKeyListSortByType;
    }[]
  >(
    () => [
      { label: t('apikey:sort_by_create_time'), value: 'createTime' },
      { label: t('apikey:sort_by_last_used_time'), value: 'lastUsedTime' },
      ...(hasUsagePlan
        ? [
            {
              label: t('apikey:sort_by_remaining_points'),
              value: 'remainingPoints' as const
            }
          ]
        : [])
    ],
    [hasUsagePlan, t]
  );

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: t('common:delete_api')
  });

  const { runAsync: onclickRemove } = useRequest(delOpenApiById, {
    successToast: t('common:delete_success'),
    onSuccess() {
      refetch();
    }
  });
  const { runAsync: copyApiKey } = useRequest(copyOpenApiKey, {
    errorToast: 'Error'
  });
  const { runAsync: onUpdateApiKeyTags, loading: isUpdatingApiKeyTags } = useRequest(
    ({ apiKeyId, tagIds }: { apiKeyId: string; tagIds: string[] }) =>
      putOpenApiKey({
        _id: apiKeyId,
        tags: tagIds
      }),
    {
      errorToast: t('common:update_failed'),
      onSuccess() {
        refetch();
        refetchTags();
      }
    }
  );

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
  } = useRequest(
    () =>
      getOpenApiKeys({
        keyword: requestKeyword || undefined,
        tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        sortBy: effectiveSortBy,
        appId
      }),
    {
      manual: false,
      refreshDeps: [requestKeyword, selectedTagIds, effectiveSortBy, appId]
    }
  );
  const {
    data: openApiTags = [],
    loading: isGettingTags,
    run: refetchTags
  } = useRequest(() => getOpenApiTags({ withKeyCount: true }), {
    manual: false
  });
  const { runAsync: onCreateTagFromSelect } = useRequest(
    async (name: string) => createOpenApiTag({ name }),
    {
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed'),
      onSuccess() {
        refetchTags();
      }
    }
  );

  const tableHeaders: Record<ApiKeyTableField, { label: React.ReactNode; width?: string }> = {
    name: { label: t('common:Name'), width: '240px' },
    apiKey: { label: 'API KEY', width: '130px' },
    usagePoints: { label: t('common:support.outlink.Usage points'), width: '150px' },
    expiredTime: { label: t('common:expired_time'), width: '120px' },
    lastUsedTime: { label: t('apikey:last_used_time'), width: '160px' },
    createTime: { label: t('apikey:create_time'), width: '160px' },
    actions: { label: t('common:Action'), width: '92px' }
  };
  const tableColumns = apiKeyTableFields
    .filter((field) => {
      if (field === 'usagePoints' || field === 'expiredTime') return hasUsagePlan;
      return field !== 'createTime' || !isPublishMode;
    })
    .map((field) => ({ field, ...tableHeaders[field] }));

  const renderTableCell = (field: ApiKeyTableField, item: (typeof apiKeys)[number]) => {
    switch (field) {
      case 'name':
        return (
          <Td key={field} maxW={'240px'}>
            <Flex flexDirection={'column'} minW={0}>
              <MyTooltip label={item.name} showOnlyWhenOverflow>
                <Box
                  maxW={'220px'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {item.name}
                </Box>
              </MyTooltip>
              <ApiKeyTagEditor
                key={`${item._id}-${(item.tagIds || []).join(',')}`}
                apiKeyId={item._id}
                appName={item.appName}
                tagIds={item.tagIds || []}
                allTags={openApiTags}
                onSave={async (apiKeyId, tagIds) => {
                  await onUpdateApiKeyTags({
                    apiKeyId,
                    tagIds
                  });
                }}
                onManage={() => setShowTagManage(true)}
                onCreateTag={onCreateTagFromSelect}
                isLoading={isGettingTags || isUpdatingApiKeyTags}
              />
            </Flex>
          </Td>
        );
      case 'apiKey':
        return (
          <Td key={field} maxW={'130px'}>
            <Flex alignItems={'center'} gap={1} role={'group'} minW={0}>
              <Box minW={0} overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
                {maskApiKey(item.apiKey)}
              </Box>
              {item.canCopy && (
                <MyIcon
                  name={copyingApiKeyId === item._id ? 'common/loading' : 'copy'}
                  w={'15px'}
                  flexShrink={0}
                  aria-label={t('common:Copy')}
                  role={'button'}
                  tabIndex={0}
                  color={'myGray.600'}
                  opacity={copyingApiKeyId === item._id ? 1 : 0}
                  visibility={copyingApiKeyId === item._id ? 'visible' : 'hidden'}
                  cursor={'pointer'}
                  transition={'opacity 0.15s ease, color 0.15s ease'}
                  _groupHover={{ opacity: 1, visibility: 'visible' }}
                  _hover={{ color: 'primary.600' }}
                  onClick={() => onCopyApiKey(item._id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCopyApiKey(item._id);
                    }
                  }}
                />
              )}
            </Flex>
          </Td>
        );
      case 'usagePoints':
        return (
          <Td key={field} whiteSpace={'nowrap'}>
            {Math.round(item.usagePoints)}/
            {item.limit?.maxUsagePoints && item.limit.maxUsagePoints > -1
              ? `${item.limit.maxUsagePoints}`
              : t('common:Unlimited')}
          </Td>
        );
      case 'expiredTime':
        return (
          <Td key={field} whiteSpace={'pre-wrap'}>
            {item.limit?.expiredTime
              ? dayjs(item.limit.expiredTime).format('YYYY/MM/DD\nHH:mm')
              : '-'}
          </Td>
        );
      case 'lastUsedTime':
        return (
          <Td key={field} whiteSpace={'normal'}>
            {item.lastUsedTime
              ? dayjs(item.lastUsedTime).format('YYYY/MM/DD HH:mm:ss')
              : t('common:un_used')}
          </Td>
        );
      case 'createTime':
        return (
          <Td key={field} whiteSpace={'normal'}>
            {dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss')}
          </Td>
        );
      case 'actions':
        return (
          <Td key={field} w={'92px'}>
            <Flex alignItems={'center'} gap={2}>
              <MyTooltip label={t('common:Edit')}>
                <IconButton
                  icon={<MyIcon name={'edit'} w={4} />}
                  variant={'whitePrimary'}
                  size={'sm'}
                  aria-label={t('common:Edit')}
                  onClick={() =>
                    setEditData({
                      _id: item._id,
                      name: item.name,
                      limit: item.limit,
                      authProxy: item.authProxy,
                      tags: item.tagIds || []
                    })
                  }
                />
              </MyTooltip>
              <MyTooltip label={t('common:Delete')}>
                <IconButton
                  icon={<MyIcon name={'delete'} w={4} />}
                  variant={'whiteDanger'}
                  size={'sm'}
                  aria-label={t('common:Delete')}
                  onClick={() => openConfirm({ onConfirm: () => onclickRemove(item._id) })()}
                />
              </MyTooltip>
            </Flex>
          </Td>
        );
    }
  };

  return (
    <MyBox
      isLoading={isGetting}
      display={'flex'}
      flexDirection={'column'}
      h={isPublishMode ? '100%' : accountPageRootStyles.h}
      minH={0}
      position={'relative'}
      p={isPublishMode ? 6 : 0}
    >
      <Flex flexDirection={'column'} alignItems={'stretch'} flexShrink={0}>
        <Flex
          minW={0}
          alignItems={'center'}
          justifyContent={'space-between'}
          h={isPublishMode ? 'auto' : '64px'}
          px={isPublishMode ? 0 : [4, 6]}
          borderBottom={isPublishMode ? 'none' : '1px solid'}
          borderColor={'myGray.200'}
        >
          <Box
            as={isPublishMode ? undefined : 'h1'}
            {...(isPublishMode
              ? {
                  color: 'myGray.900',
                  fontWeight: 'medium',
                  fontSize: 'lg'
                }
              : accountTitleTextStyles)}
          >
            {isPublishMode
              ? `${t('common:support.openapi.Api manager')}(${apiKeys.length})`
              : `${t('account:api_key')} (${apiKeys.length})`}
          </Box>
          <Flex alignItems={'center'} gap={2} ml={3}>
            {feConfigs?.docUrl && (
              <Button
                as={Link}
                href={feConfigs.openAPIDocUrl || getDocPath('/openapi/intro')}
                target={'_blank'}
                size={'sm'}
                variant={'whitePrimary'}
                textDecoration={'none'}
                _hover={{ textDecoration: 'none' }}
              >
                {t('apikey:usage_tutorial')}
              </Button>
            )}
            <Button
              as={Link}
              href={'/apidoc/systemopenapi'}
              target={'_blank'}
              size={'sm'}
              variant={'primary'}
              textDecoration={'none'}
              _hover={{ textDecoration: 'none' }}
            >
              {t('apikey:openapi_document')}
            </Button>
          </Flex>
        </Flex>
        <Flex
          pt={isPublishMode ? 3 : 6}
          px={isPublishMode ? 0 : [4, 6]}
          alignItems={['stretch', 'flex-end']}
          justifyContent={'space-between'}
          gap={3}
          minW={0}
          flexDirection={['column', 'row']}
          flexWrap={'wrap'}
        >
          <Flex
            alignItems={['stretch', 'center']}
            gap={2}
            flex={['unset', '1 1 0']}
            minW={0}
            w={['100%', 'auto']}
            flexDirection={['column', 'row']}
            flexWrap={'wrap'}
          >
            <SearchInput
              value={keyword}
              placeholder={t('apikey:search_key_name_or_value')}
              bg={'white'}
              maxW={['100%', '240px']}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <TagMultiSelect
              tags={openApiTags}
              value={selectedTagIds}
              onChange={setSelectedTagIds}
              label={t('apikey:tags')}
              placeholder={t('common:All')}
              onManage={() => setShowTagManage(true)}
              onCreateTag={onCreateTagFromSelect}
              isLoading={isGettingTags}
              popoverW="220px"
            />
            <SingleSelectFilter
              title={t('apikey:sort_label')}
              value={effectiveSortBy}
              options={sortOptions}
              onChange={setSortBy}
            />
          </Flex>
          <Flex
            alignItems={['stretch', 'center']}
            justifyContent={['flex-start', 'flex-end']}
            gap={2}
            flexShrink={0}
            minW={0}
            w={['100%', 'auto']}
            flexDirection={['column', 'row']}
          >
            <MyTooltip label={t('common:click_to_copy')}>
              <Flex
                alignItems={'center'}
                w={['100%', '320px']}
                h={'36px'}
                px={3}
                border={'1px solid'}
                borderColor={'myGray.200'}
                borderRadius={'md'}
                cursor={'pointer'}
                userSelect={'none'}
                bg={'white'}
                fontSize={'sm'}
                _hover={{
                  borderColor: 'primary.300',
                  boxShadow: '0 0 0 2px rgba(51, 112, 255, 0.12)'
                }}
                onClick={() => copyData(baseUrl, t('common:support.openapi.Copy success'))}
              >
                <Box flexShrink={0} color={'myGray.600'}>
                  {t('common:support.openapi.Api baseurl')}
                </Box>
                <Box mx={2} w={'1px'} h={'16px'} bg={'myGray.200'} />
                <Box
                  flex={1}
                  minW={0}
                  color={'myGray.900'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {baseUrl}
                </Box>
              </Flex>
            </MyTooltip>
            <Button
              size={['sm', 'md']}
              leftIcon={<MyIcon name={'common/addLight'} w={'1.25rem'} color={'white'} />}
              variant={'primary'}
              onClick={() => setEditData(getDefaultEditData())}
            >
              {t('common:new_create')}
            </Button>
          </Flex>
        </Flex>
      </Flex>
      <TableContainer
        mt={3}
        px={isPublishMode ? 0 : [4, 6]}
        pb={isPublishMode ? 0 : 6}
        position={'relative'}
        flex={isPublishMode ? '1 0 0' : accountContentScrollStyles.flex}
        h={isPublishMode ? 0 : accountContentScrollStyles.h}
        minH={0}
        overflowY={isPublishMode ? 'auto' : accountContentScrollStyles.overflowY}
      >
        <Table sx={{ tableLayout: 'fixed' }}>
          <Thead>
            <Tr>
              {tableColumns.map(({ field, width, label }) => (
                <Th key={field} w={width}>
                  {label}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {apiKeys.map((item) => (
              <Tr key={item._id}>
                {tableColumns.map(({ field }) => renderTableCell(field, item))}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {!!editData && (
        <EditKeyModal
          defaultData={editData}
          tags={openApiTags}
          onClose={() => setEditData(undefined)}
          onCreate={(id) => {
            setApiKey(id);
            refetch();
            refetchTags();
            setEditData(undefined);
          }}
          onEdit={() => {
            refetch();
            refetchTags();
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
      {showTagManage && (
        <TagManageModal
          tags={openApiTags}
          onClose={() => setShowTagManage(false)}
          onRefreshTags={refetchTags}
          onRefreshKeys={refetch}
        />
      )}
    </MyBox>
  );
};

export default React.memo(ApiKeyTable);

// edit link modal
function EditKeyModal({
  defaultData,
  tags,
  onClose,
  onCreate,
  onEdit
}: {
  defaultData: EditProps;
  tags: OpenApiTagType[];
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
}) {
  const { t } = useClientTranslation('apikey');
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
      errorToast: t('apikey:create_link_error'),
      onSuccess: onCreate
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest(
    (e: EditProps) => {
      //@ts-ignore
      return putOpenApiKey(e);
    },
    {
      errorToast: t('apikey:update_link_error'),
      onSuccess: onEdit
    }
  );

  return (
    <MyModalV2
      isOpen={true}
      title={isEdit ? t('apikey:edit_api_key') : t('apikey:create_api_key')}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>

          <Button
            isLoading={creating || updating}
            onClick={submitShareChat((data) => {
              const trimData = {
                ...data,
                name: data.name.trim()
              };

              return isEdit ? onclickUpdate(trimData) : onclickCreate(trimData);
            })}
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Flex flexDirection={'column'} gap={4}>
        <Flex alignItems={'center'} gap={4}>
          <FormLabel flex={'0 0 90px'} required>
            {t('common:Name')}
          </FormLabel>
          <Input
            placeholder={t('apikey:key_alias') || 'key_alias'}
            maxLength={50}
            {...register('name', {
              required: t('common:name_is_empty') || 'name_is_empty',
              validate: (value) => !!value.trim() || t('common:name_is_empty') || 'name_is_empty'
            })}
          />
        </Flex>
        <Flex alignItems={'center'} gap={4}>
          <FormLabel flex={'0 0 90px'}>{t('apikey:tags')}</FormLabel>
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <TagMultiSelect
                tags={tags}
                value={field.value || []}
                onChange={field.onChange}
                placeholder={t('apikey:select_tag')}
                showFooter={false}
                w={'100%'}
              />
            )}
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
        <Flex alignItems={'center'} gap={4} mt={4}>
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
      </Flex>
    </MyModalV2>
  );
}
