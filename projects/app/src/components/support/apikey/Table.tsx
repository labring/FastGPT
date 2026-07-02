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
import { useTranslation } from 'next-i18next';
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
import MySelect from '@fastgpt/web/components/common/MySelect';
import TagDisplayList, { type ApiKeyDisplayTag } from './TagDisplayList';
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
  tips?: string;
  mode?: 'account' | 'publish';
  appId?: string;
};

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
      Trigger={
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
          onClick={(e) => e.stopPropagation()}
        >
          <TagDisplayList tags={displayTags} />
        </Box>
      }
      onClose={(nextTagIds) => {
        if (!isSameTagIds(nextTagIds, tagIds)) {
          return onSave(apiKeyId, nextTagIds);
        }
      }}
    />
  );
};

const ApiKeyTable = ({ mode = 'account', appId }: ApiKeyTableProps) => {
  const { t } = useTranslation();
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
      { label: t('account_apikey:sort_by_create_time'), value: 'createTime' },
      { label: t('account_apikey:sort_by_last_used_time'), value: 'lastUsedTime' },
      ...(hasUsagePlan
        ? [
            {
              label: t('account_apikey:sort_by_remaining_points'),
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

  return (
    <MyBox
      isLoading={isGetting}
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      position={'relative'}
      pt={0}
      px={0}
      minH={isPublishMode ? '50vh' : undefined}
    >
      <Flex alignItems={'center'} gap={3} flexWrap={'wrap'}>
        <Flex flex={'1 0 180px'} minW={0} alignItems={'center'}>
          <Box
            color={'myGray.900'}
            fontSize={isPublishMode ? ['md', 'lg'] : 'lg'}
            fontWeight={isPublishMode ? 'bold' : 'normal'}
          >
            {t('common:support.openapi.Api manager')}({apiKeys.length})
          </Box>
          {feConfigs?.docUrl && (
            <Link
              href={feConfigs.openAPIDocUrl || getDocPath('/openapi/intro')}
              target={'_blank'}
              ml={isPublishMode ? 2 : 1}
              color={'primary.500'}
              fontSize={'sm'}
            >
              <Flex alignItems={'center'}>
                <MyIcon name="book" w={'17px'} h={'17px'} mr="1" />
                {t('account_apikey:tutorial')}
              </Flex>
            </Link>
          )}
        </Flex>
        <Flex
          alignItems={['stretch', 'center']}
          justifyContent={'flex-end'}
          gap={2}
          flex={['1 0 100%', '999 1 720px']}
          minW={0}
          flexDirection={['column', 'row']}
          flexWrap={'wrap'}
        >
          <SearchInput
            value={keyword}
            placeholder={t('account_apikey:search_key_name_or_value')}
            bg={'white'}
            maxW={['100%', '240px']}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <TagMultiSelect
            tags={openApiTags}
            value={selectedTagIds}
            onChange={setSelectedTagIds}
            label={t('account_apikey:tags')}
            placeholder={t('common:All')}
            onManage={() => setShowTagManage(true)}
            onCreateTag={onCreateTagFromSelect}
            isLoading={isGettingTags}
            w={['100%', '180px']}
          />
          <MySelect<ApiKeyListSortByType>
            width={['100%', '200px']}
            h={'36px'}
            value={effectiveSortBy}
            list={sortOptions}
            menuPlacement={'bottom-end'}
            onChange={setSortBy}
            valueLabel={
              <Flex alignItems={'center'} w={'100%'} minW={0}>
                <Box flexShrink={0} color={'myGray.600'}>
                  {t('account_apikey:sort_label')}
                </Box>
                <Box mx={3} w={'1px'} h={'16px'} bg={'myGray.200'} />
                <Box
                  flex={1}
                  color={'myGray.900'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {sortOptions.find((item) => item.value === effectiveSortBy)?.label}
                </Box>
              </Flex>
            }
          />
          <MyTooltip label={baseUrl}>
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
              <Box mx={3} w={'1px'} h={'16px'} bg={'myGray.200'} />
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
            leftIcon={
              <MyIcon
                name={'common/addLight'}
                w={'1.25rem'}
                color={isPublishMode ? 'white' : 'primary.600'}
              />
            }
            variant={isPublishMode ? 'primary' : 'whitePrimary'}
            onClick={() => setEditData(getDefaultEditData())}
          >
            {t('common:new_create')}
          </Button>
        </Flex>
      </Flex>
      <TableContainer mt={3} position={'relative'} minH={'300px'}>
        <Table sx={{ tableLayout: 'fixed' }}>
          <Thead>
            <Tr>
              <Th w={'240px'}>{t('common:Name')}</Th>
              <Th w={'130px'}>API KEY</Th>
              {hasUsagePlan && <Th w={'150px'}>{t('common:support.outlink.Usage points')}</Th>}
              {hasUsagePlan && (
                <>
                  <Th w={'120px'}>{t('common:expired_time')}</Th>
                </>
              )}

              <Th w={'160px'}>{t('account_apikey:last_used_time')}</Th>
              <Th w={'160px'}>{t('account_apikey:create_time')}</Th>
              <Th w={'92px'} />
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {apiKeys.map(
              ({
                _id,
                name,
                limit,
                usagePoints,
                apiKey,
                canCopy,
                createTime,
                lastUsedTime,
                authProxy,
                appName,
                tagIds
              }) => (
                <Tr key={_id}>
                  <Td maxW={'240px'}>
                    <Flex flexDirection={'column'} minW={0}>
                      <MyTooltip label={name} showOnlyWhenOverflow>
                        <Box
                          maxW={'220px'}
                          overflow={'hidden'}
                          textOverflow={'ellipsis'}
                          whiteSpace={'nowrap'}
                        >
                          {name}
                        </Box>
                      </MyTooltip>
                      <ApiKeyTagEditor
                        key={`${_id}-${(tagIds || []).join(',')}`}
                        apiKeyId={_id}
                        appName={appName}
                        tagIds={tagIds || []}
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
                  <Td maxW={'130px'}>
                    <Flex alignItems={'center'} gap={1} role={'group'} minW={0}>
                      <Box
                        minW={0}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        whiteSpace={'nowrap'}
                      >
                        {maskApiKey(apiKey)}
                      </Box>
                      {canCopy && (
                        <MyIcon
                          name={copyingApiKeyId === _id ? 'common/loading' : 'copy'}
                          w={'15px'}
                          flexShrink={0}
                          aria-label={t('common:Copy')}
                          role={'button'}
                          tabIndex={0}
                          color={'myGray.600'}
                          opacity={copyingApiKeyId === _id ? 1 : 0}
                          visibility={copyingApiKeyId === _id ? 'visible' : 'hidden'}
                          cursor={'pointer'}
                          transition={'opacity 0.15s ease, color 0.15s ease'}
                          _groupHover={{ opacity: 1, visibility: 'visible' }}
                          _hover={{ color: 'primary.600' }}
                          onClick={() => onCopyApiKey(_id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onCopyApiKey(_id);
                            }
                          }}
                        />
                      )}
                    </Flex>
                  </Td>
                  {hasUsagePlan && (
                    <Td whiteSpace={'nowrap'}>
                      {Math.round(usagePoints)}/
                      {limit?.maxUsagePoints && limit?.maxUsagePoints > -1
                        ? `${limit?.maxUsagePoints}`
                        : t('common:Unlimited')}
                    </Td>
                  )}
                  {hasUsagePlan && (
                    <>
                      <Td whiteSpace={'pre-wrap'}>
                        {limit?.expiredTime
                          ? dayjs(limit?.expiredTime).format('YYYY/MM/DD\nHH:mm')
                          : '-'}
                      </Td>
                    </>
                  )}
                  <Td whiteSpace={'normal'}>
                    {lastUsedTime
                      ? dayjs(lastUsedTime).format('YYYY/MM/DD HH:mm:ss')
                      : t('common:un_used')}
                  </Td>
                  <Td whiteSpace={'normal'}>{dayjs(createTime).format('YYYY/MM/DD HH:mm:ss')}</Td>
                  <Td w={'92px'}>
                    <Flex alignItems={'center'} gap={2}>
                      <MyTooltip label={t('common:Edit')}>
                        <IconButton
                          icon={<MyIcon name={'edit'} w={4} />}
                          variant={'whitePrimary'}
                          size={'sm'}
                          aria-label={t('common:Edit')}
                          onClick={() =>
                            setEditData({
                              _id,
                              name,
                              limit,
                              authProxy,
                              tags: tagIds || []
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
                          onClick={() => openConfirm({ onConfirm: () => onclickRemove(_id) })()}
                        />
                      </MyTooltip>
                    </Flex>
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
          <FormLabel flex={'0 0 90px'}>{t('common:Name')}</FormLabel>
          <Input
            placeholder={t('publish:key_alias') || 'key_alias'}
            maxLength={50}
            {...register('name', {
              required: t('common:name_is_empty') || 'name_is_empty',
              validate: (value) => !!value.trim() || t('common:name_is_empty') || 'name_is_empty'
            })}
          />
        </Flex>
        <Flex alignItems={'center'} gap={4}>
          <FormLabel flex={'0 0 90px'}>{t('account_apikey:tags')}</FormLabel>
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <TagMultiSelect
                tags={tags}
                value={field.value || []}
                onChange={field.onChange}
                placeholder={t('account_apikey:select_tag')}
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
