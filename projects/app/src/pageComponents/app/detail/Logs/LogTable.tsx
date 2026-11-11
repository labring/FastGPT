import { formatToISOWithTimezone } from '@fastgpt/global/common/string/time';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  getChatPublishSourceName,
  getChatPublishSourceType
} from '@fastgpt/global/common/chat/publishSource';
import { getLogIdentity, normalizeAppLogKeys } from '@fastgpt/global/core/app/logs/utils';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Checkbox
} from '@chakra-ui/react';
import { ChatSourceMap, type ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import {
  FilterInput,
  MultiSelectFilter,
  createMultiSelectFilter,
  toMultiSelectFilterQuery,
  useCommonFilterLabels
} from '@fastgpt/web/components/common/TagFilter';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useDebounce, useEventListener, useLocalStorageState } from 'ahooks';
import { getLogKeys } from '@/web/core/app/api/log';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  AppLogKeysEnum,
  AppLogKeysEnumMap,
  DefaultAppLogKeys
} from '@fastgpt/global/core/app/logs/constants';
import { isEqual } from 'lodash-es';
import SyncLogKeysPopover from './SyncLogKeysPopover';
import LogKeysConfigPopover from './LogKeysConfigPopover';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { downloadFetch } from '@/web/common/system/utils';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getAppChatLogs, searchAppChatLogs } from '@/web/core/app/api/log';
import { useStaticVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import type {
  AppChatLogsSearchCursor,
  AppLogsListItemType,
  getAppChatLogsBody,
  getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';
import dayjs from 'dayjs';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import dynamic from 'next/dynamic';
import type { HeaderControlProps } from './LogChart';
import FeedbackTypeFilter from './FeedbackTypeFilter';
import UserIpTypeFilter, { type UserIpTypeValue } from './UserIpTypeFilter';
import ErrorCountFilter from './ErrorCountFilter';
import UserFilter, { parseUserKey } from './UserFilter';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { batchDeleteChatHistories } from '@/web/core/chat/history/api';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyLoading from '@fastgpt/web/components/common/MyLoading';

const DetailLogsModal = dynamic(() => import('./DetailLogsModal'));
const logRowHeight = 57;

/** 隔离输入态，避免每次键入都重渲染日志表格。 */
const LogSearchInput = React.memo(({ onSearch }: { onSearch: (value: string) => void }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const debouncedValue = useDebounce(value, { wait: 400 });

  React.useEffect(() => {
    onSearch(debouncedValue.trim());
  }, [debouncedValue, onSearch]);

  return (
    <FilterInput
      flex={'0 1 230px'}
      label={t('common:Search')}
      placeholder={t('app:logs_search_placeholder')}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
});
LogSearchInput.displayName = 'LogSearchInput';

type LogTableProps = HeaderControlProps & {
  pageSizeCacheKey: string;
  cursorSearch?: boolean;
};

const LogTable = ({
  appId,
  sourceFilter,
  setSourceFilter,
  dateRange,
  setDateRange,
  pageSizeCacheKey,
  cursorSearch = false,
  showSourceSelector = true,
  px = [4, 8]
}: LogTableProps) => {
  const { t } = useTranslation();
  const labels = useCommonFilterLabels();
  const { feConfigs } = useSystemStore();

  const [detailLogData, setDetailLogData] = useState<{
    chatId: string;
    feedbackUserName?: string;
  }>();
  const appName = useContextSelector(AppContext, (v) => v.appDetail.name);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [userIpType, setUserIpType] = useState<UserIpTypeValue>('all');
  const [feedbackType, setFeedbackType] = useState<'all' | 'has_feedback' | 'good' | 'bad'>('all');
  const [errorFilter, setErrorFilter] = useState<'all' | 'has_error'>('all');

  const sourceOptions = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  // user filter
  const [userFilter, setUserFilter] = useState(createMultiSelectFilter());

  // chat
  const [searchQuery, setSearchQuery] = useState('');
  const isCursorSearchMode = cursorSearch && searchQuery.length > 0;
  const [searchResult, setSearchResult] = useState<{
    list: AppLogsListItemType[];
    nextCursor?: AppChatLogsSearchCursor;
    loading: boolean;
    error: boolean;
  }>({ list: [], loading: false, error: false });
  const searchNextCursorRef = useRef<AppChatLogsSearchCursor>();
  const searchLoadingRef = useRef(false);
  const searchRequestIdRef = useRef(0);
  const searchControllerRef = useRef<AbortController>();

  // log keys
  const [storedLogKeys, setLogKeys] = useLocalStorageState<AppLogKeysType[]>(
    `app_log_keys_${appId}`
  );
  const logKeys = useMemo(() => normalizeAppLogKeys(storedLogKeys), [storedLogKeys]);
  const { runAsync: fetchLogKeys, data: teamLogKeys } = useRequest(
    async () => {
      return getLogKeys({ appId });
    },
    {
      manual: false,
      refreshDeps: [appId],
      onSuccess: (res) => {
        if (storedLogKeys?.length) return;
        if (res.logKeys.length > 0) {
          setLogKeys(normalizeAppLogKeys(res.logKeys));
        } else if (res.logKeys.length === 0) {
          setLogKeys(DefaultAppLogKeys);
        }
      }
    }
  );
  const showSyncPopover = useMemo(() => {
    const teamLogKeysList = normalizeAppLogKeys(teamLogKeys?.logKeys).filter((item) => item.enable);
    const personalLogKeysList = logKeys.filter((item) => item.enable);
    return !isEqual(teamLogKeysList, personalLogKeysList);
  }, [teamLogKeys, logKeys]);

  const { tmbIds, outLinkUids } = useMemo(() => {
    if (userFilter.mode !== 'selected') {
      return { tmbIds: undefined, outLinkUids: undefined };
    }
    const selectedUsers = userFilter.values.map(parseUserKey);
    return {
      tmbIds: selectedUsers.filter((u) => u.tmbId && !u.outLinkUid).map((u) => u.tmbId!),
      outLinkUids: selectedUsers.filter((u) => u.outLinkUid).map((u) => u.outLinkUid!)
    };
  }, [userFilter]);

  // 失败提示和 loading 由 PopoverConfirm 统一处理，避免重复 toast。
  const exportLogs = async () => {
    const enabledKeys = logKeys.filter((item) => item.enable).map((item) => item.key);
    const headerTitle = enabledKeys.map((k) => t(AppLogKeysEnumMap[k])).join(',');
    await downloadFetch({
      url: '/api/core/app/logs/exportLogs',
      filename: t('app:export_log_filename', { name: appName }),
      body: {
        appId,
        dateStart: formatToISOWithTimezone(dateRange.from),
        dateEnd: formatToISOWithTimezone(dateRange.to),
        sources: toMultiSelectFilterQuery(sourceFilter),
        tmbIds,
        outLinkUids,
        chatSearch: searchQuery,
        title: `${headerTitle},${t('app:logs_keys_chatDetails')}`,
        logKeys: enabledKeys,
        sourcesMap: Object.fromEntries(
          Object.entries(ChatSourceMap).map(([key, config]) => [
            key,
            {
              label: t(config.name as any)
            }
          ])
        ),
        feedbackType,
        unreadOnly,
        errorFilter: errorFilter === 'all' ? undefined : errorFilter
      }
    });
  };
  const params = useMemoEnhance(
    () => ({
      appId,
      dateStart: dateRange.from!,
      dateEnd: dateRange.to!,
      sources: toMultiSelectFilterQuery(sourceFilter),
      tmbIds,
      outLinkUids,
      chatSearch: searchQuery || undefined,
      feedbackType,
      unreadOnly: feedbackType === 'all' ? undefined : unreadOnly,
      errorFilter: errorFilter === 'all' ? undefined : errorFilter
    }),
    [
      appId,
      sourceFilter,
      dateRange.from,
      dateRange.to,
      tmbIds,
      outLinkUids,
      searchQuery,
      feedbackType,
      unreadOnly,
      errorFilter
    ]
  );

  const listApi = useCallback(
    async (data: getAppChatLogsBody): Promise<getAppChatLogsResponseType> => {
      if (isCursorSearchMode) return { list: [], total: 0 };
      return getAppChatLogs(data);
    },
    [isCursorSearchMode]
  );

  // @types/react 18 的 DOM ref 与 FixedTable 的 RefObject<HTMLDivElement> 签名兼容。
  const virtualContainerRef = useRef<HTMLDivElement>(null!);
  const pagination = usePagination(listApi, {
    defaultPageSize: 20,
    pageSizeCacheKey,
    params,
    refreshDeps: [params, isCursorSearchMode],
    scrollContainerRef: virtualContainerRef
  });

  const { data: listLogs, isLoading, Pagination, getData, pageNum, total, pageSize } = pagination;
  const logs = isCursorSearchMode ? searchResult.list : listLogs;
  const { virtualDataList, topPlaceholderHeight, bottomPlaceholderHeight } = useStaticVirtualList({
    data: logs,
    itemHeight: logRowHeight,
    overscan: 8,
    containerRef: virtualContainerRef
  });

  /**
   * 加载一页搜索结果。重置请求会取消旧搜索；追加请求保留已有列表。
   * 使用请求序号拦截取消后迟到的响应，避免覆盖新关键词结果。
   */
  const loadSearchPage = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (!searchQuery) return;
      if (!reset && (searchLoadingRef.current || !searchNextCursorRef.current)) return;

      if (reset) {
        searchControllerRef.current?.abort();
        searchNextCursorRef.current = undefined;
        if (virtualContainerRef.current) virtualContainerRef.current.scrollTop = 0;
      }

      const controller = new AbortController();
      const requestId = ++searchRequestIdRef.current;
      searchControllerRef.current = controller;
      searchLoadingRef.current = true;
      setSearchResult((prev) => ({
        list: reset ? [] : prev.list,
        nextCursor: reset ? undefined : prev.nextCursor,
        loading: true,
        error: false
      }));

      try {
        const res = await searchAppChatLogs(
          {
            ...params,
            chatSearch: searchQuery,
            cursor: reset ? undefined : searchNextCursorRef.current
          },
          controller
        );
        if (controller.signal.aborted || requestId !== searchRequestIdRef.current) return;

        searchNextCursorRef.current = res.nextCursor;
        setSearchResult((prev) => ({
          list: reset ? res.list : [...prev.list, ...res.list],
          nextCursor: res.nextCursor,
          loading: false,
          error: false
        }));
      } catch {
        if (controller.signal.aborted || requestId !== searchRequestIdRef.current) return;
        setSearchResult((prev) => ({ ...prev, loading: false, error: true }));
      } finally {
        if (requestId === searchRequestIdRef.current && searchControllerRef.current === controller)
          searchLoadingRef.current = false;
      }
    },
    [params, searchQuery]
  );

  React.useEffect(() => {
    searchNextCursorRef.current = undefined;
    if (!isCursorSearchMode) return;

    loadSearchPage({ reset: true });
    return () => {
      searchRequestIdRef.current += 1;
      searchControllerRef.current?.abort();
      searchLoadingRef.current = false;
    };
  }, [isCursorSearchMode, loadSearchPage]);

  useEventListener(
    'scroll',
    () => {
      const container = virtualContainerRef.current;
      if (
        !isCursorSearchMode ||
        !container ||
        searchLoadingRef.current ||
        searchResult.error ||
        !searchNextCursorRef.current
      ) {
        return;
      }
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
        loadSearchPage();
      }
    },
    { target: virtualContainerRef, passive: true }
  );

  const {
    selectedItems,
    toggleSelect,
    isSelected,
    getRowSelectionProps,
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger,
    setSelectedItems
  } = useTableMultipleSelect({
    list: logs,
    getItemId: (item) => item._id
  });
  React.useEffect(() => {
    setSelectedItems([]);
  }, [params, setSelectedItems]);
  const chatIds = useMemoEnhance(() => selectedItems.map((item) => item.chatId), [selectedItems]);
  const refreshCurrentList = useCallback(async () => {
    if (isCursorSearchMode) {
      await loadSearchPage({ reset: true });
    } else {
      await getData(pageNum);
    }
  }, [getData, isCursorSearchMode, loadSearchPage, pageNum]);

  const { openConfirm: openConfirmDelete, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    type: 'delete'
  });

  const { runAsync: handleDelete } = useRequest(
    async (chatIds: string[]) => {
      await batchDeleteChatHistories({ appId, chatIds });
      await refreshCurrentList();
    },
    {
      successToast: t('common:delete_success')
    }
  );

  const HeaderRenderMap = useMemoEnhance(
    () => ({
      [AppLogKeysEnum.PUBLISH_SOURCE_TYPE]: (
        <Th key={AppLogKeysEnum.PUBLISH_SOURCE_TYPE}>{t('app:logs_keys_publish_source_type')}</Th>
      ),
      [AppLogKeysEnum.SOURCE]: <Th key={AppLogKeysEnum.SOURCE}>{t('app:logs_keys_source')}</Th>,
      [AppLogKeysEnum.CREATED_TIME]: (
        <Th key={AppLogKeysEnum.CREATED_TIME}>{t('app:logs_keys_createdTime')}</Th>
      ),
      [AppLogKeysEnum.LAST_CONVERSATION_TIME]: (
        <Th key={AppLogKeysEnum.LAST_CONVERSATION_TIME}>
          {t('app:logs_keys_lastConversationTime')}
        </Th>
      ),
      [AppLogKeysEnum.USER]: <Th key={AppLogKeysEnum.USER}>{t('app:logs_keys_user')}</Th>,
      [AppLogKeysEnum.AUTH_USER]: (
        <Th key={AppLogKeysEnum.AUTH_USER}>{t('app:logs_keys_auth_user')}</Th>
      ),
      [AppLogKeysEnum.REGION]: (
        <Th key={AppLogKeysEnum.REGION}>
          <UserIpTypeFilter
            userIpType={userIpType}
            setUserIpType={setUserIpType}
            menuButtonProps={{
              fontSize: '12.8px',
              fontWeight: 'medium',
              color: 'myGray.600',
              px: 0,
              _hover: {},
              _active: {}
            }}
          />
        </Th>
      ),
      [AppLogKeysEnum.TITLE]: <Th key={AppLogKeysEnum.TITLE}>{t('app:logs_title')}</Th>,
      [AppLogKeysEnum.SESSION_ID]: (
        <Th key={AppLogKeysEnum.SESSION_ID}>{t('app:logs_keys_sessionId')}</Th>
      ),
      [AppLogKeysEnum.MESSAGE_COUNT]: (
        <Th key={AppLogKeysEnum.MESSAGE_COUNT}>{t('app:logs_message_total')}</Th>
      ),
      [AppLogKeysEnum.FEEDBACK]: (
        <Th key={AppLogKeysEnum.FEEDBACK}>
          <FeedbackTypeFilter
            feedbackType={feedbackType}
            setFeedbackType={setFeedbackType}
            unreadOnly={unreadOnly}
            setUnreadOnly={setUnreadOnly}
            placement="right"
            menuButtonProps={{
              fontSize: '12.8px',
              fontWeight: 'medium',
              color: 'myGray.600',
              px: 0,
              _hover: {},
              _active: {}
            }}
          />
        </Th>
      ),
      [AppLogKeysEnum.CUSTOM_FEEDBACK]: (
        <Th key={AppLogKeysEnum.CUSTOM_FEEDBACK}>
          {t('common:core.app.feedback.Custom feedback')}
        </Th>
      ),
      [AppLogKeysEnum.ANNOTATED_COUNT]: (
        <Th key={AppLogKeysEnum.ANNOTATED_COUNT}>
          <Flex gap={1} alignItems={'center'}>
            {t('app:mark_count')}
            <QuestionTip label={t('common:core.chat.Mark Description')} />
          </Flex>
        </Th>
      ),
      [AppLogKeysEnum.RESPONSE_TIME]: (
        <Th key={AppLogKeysEnum.RESPONSE_TIME}>{t('app:logs_response_time')}</Th>
      ),
      [AppLogKeysEnum.ERROR_COUNT]: (
        <Th key={AppLogKeysEnum.ERROR_COUNT}>
          <ErrorCountFilter
            errorFilter={errorFilter}
            setErrorFilter={setErrorFilter}
            placement="right"
            menuButtonProps={{
              fontSize: '12.8px',
              fontWeight: 'medium',
              color: 'myGray.600',
              px: 0,
              _hover: {},
              _active: {}
            }}
          />
        </Th>
      ),
      [AppLogKeysEnum.POINTS]: <Th key={AppLogKeysEnum.POINTS}>{t('app:logs_points')}</Th>,
      [AppLogKeysEnum.VERSION_NAME]: (
        <Th key={AppLogKeysEnum.VERSION_NAME}>{t('app:logs_keys_versionName')}</Th>
      )
    }),
    [t, feedbackType, unreadOnly, userIpType, errorFilter]
  );

  const getCellRenderMap = useCallback(
    (item: AppLogsListItemType) => ({
      [AppLogKeysEnum.PUBLISH_SOURCE_TYPE]: (
        <Td key={AppLogKeysEnum.PUBLISH_SOURCE_TYPE}>
          {item.publishSource?.type && ChatSourceMap[item.publishSource.type]
            ? t(ChatSourceMap[item.publishSource.type].name)
            : '-'}
        </Td>
      ),
      [AppLogKeysEnum.SOURCE]: (
        <Td key={AppLogKeysEnum.SOURCE}>
          <MyTooltip
            label={
              item.publishSource?.id
                ? t('app:logs_publish_source_id', { id: item.publishSource.id })
                : undefined
            }
          >
            <Box as="span">
              {getChatPublishSourceName({
                type: getChatPublishSourceType(item),
                name: item.publishSource?.name,
                sourceName: item.sourceName
              }) ?? '-'}
            </Box>
          </MyTooltip>
        </Td>
      ),
      [AppLogKeysEnum.CREATED_TIME]: (
        <Td key={AppLogKeysEnum.CREATED_TIME}>
          {dayjs(item.createTime).format('YYYY/MM/DD HH:mm')}
        </Td>
      ),
      [AppLogKeysEnum.LAST_CONVERSATION_TIME]: (
        <Td key={AppLogKeysEnum.LAST_CONVERSATION_TIME}>
          {dayjs(item.updateTime).format('YYYY/MM/DD HH:mm')}
        </Td>
      ),
      [AppLogKeysEnum.USER]: (
        <Td key={AppLogKeysEnum.USER}>
          {getLogIdentity(item).member ? (
            <UserBox sourceMember={getLogIdentity(item).member!} />
          ) : (
            getLogIdentity(item).name
          )}
        </Td>
      ),
      [AppLogKeysEnum.AUTH_USER]: (
        <Td key={AppLogKeysEnum.AUTH_USER}>
          {item.authMember ? (
            <UserBox sourceMember={item.authMember} />
          ) : (
            getLogIdentity({ ...item, isAuthorizer: true }).name
          )}
        </Td>
      ),
      [AppLogKeysEnum.REGION]: (
        <Td key={AppLogKeysEnum.REGION}>
          {userIpType === 'only_ip'
            ? item.originIp || '-'
            : userIpType === 'only_region'
              ? item.originIp !== item.region
                ? item.region || '-'
                : '-'
              : item.originIp
                ? `${item.region || '-'}: ${item.originIp}`
                : '-'}
        </Td>
      ),
      [AppLogKeysEnum.TITLE]: (
        <Td key={AppLogKeysEnum.TITLE} className="textEllipsis" maxW={'250px'}>
          {item.title || '-'}
        </Td>
      ),
      [AppLogKeysEnum.SESSION_ID]: (
        <Td key={AppLogKeysEnum.SESSION_ID} className="textEllipsis" maxW={'200px'}>
          {item.chatId || '-'}
        </Td>
      ),
      [AppLogKeysEnum.MESSAGE_COUNT]: (
        <Td key={AppLogKeysEnum.MESSAGE_COUNT}>{item.messageCount}</Td>
      ),
      [AppLogKeysEnum.FEEDBACK]: (
        <Td key={AppLogKeysEnum.FEEDBACK}>
          <Flex gap={3} px={1}>
            {!!item?.userGoodFeedbackCount && (
              <Flex alignItems={'center'}>
                <MyIcon mr={1} name={'core/chat/feedback/goodLight'} color={'myGray.400'} w={4} />
                {item.userGoodFeedbackCount}
              </Flex>
            )}
            {!!item?.userBadFeedbackCount && (
              <Flex alignItems={'center'}>
                <MyIcon mr={1} name={'core/chat/feedback/badLight'} color={'myGray.400'} w={4} />
                {item.userBadFeedbackCount}
              </Flex>
            )}
            {!item?.userGoodFeedbackCount && !item?.userBadFeedbackCount && <>-</>}
          </Flex>
        </Td>
      ),
      [AppLogKeysEnum.CUSTOM_FEEDBACK]: (
        <Td key={AppLogKeysEnum.CUSTOM_FEEDBACK}>{item.customFeedbacksCount || '-'}</Td>
      ),
      [AppLogKeysEnum.ANNOTATED_COUNT]: (
        <Td key={AppLogKeysEnum.ANNOTATED_COUNT}>{item.markCount}</Td>
      ),
      [AppLogKeysEnum.RESPONSE_TIME]: (
        <Td key={AppLogKeysEnum.RESPONSE_TIME}>
          {item.averageResponseTime ? `${item.averageResponseTime.toFixed(2)}s` : '-'}
        </Td>
      ),
      [AppLogKeysEnum.ERROR_COUNT]: (
        <Td key={AppLogKeysEnum.ERROR_COUNT}>{item.errorCount || '-'}</Td>
      ),
      [AppLogKeysEnum.POINTS]: (
        <Td key={AppLogKeysEnum.POINTS}>
          {item.totalPoints ? `${item.totalPoints.toFixed(2)}` : '-'}
        </Td>
      ),
      [AppLogKeysEnum.VERSION_NAME]: (
        <Td key={AppLogKeysEnum.VERSION_NAME}>{item.versionName || '-'}</Td>
      )
    }),
    [t, userIpType]
  );

  return (
    <Flex flexDirection={'column'} h={'full'} px={px}>
      <Flex alignItems={'center'} gap={3} flexWrap={'wrap'}>
        <DateRangePicker
          defaultDate={dateRange}
          onSuccess={setDateRange}
          formLabel={t('app:logs_date')}
        />
        {showSourceSelector && (
          <MultiSelectFilter
            title={t('app:logs_source')}
            value={sourceFilter}
            onChange={setSourceFilter}
            options={sourceOptions}
            labels={labels}
          />
        )}
        {feConfigs?.isPlus && (
          <UserFilter
            appId={appId}
            dateRange={dateRange}
            sources={toMultiSelectFilterQuery(sourceFilter)}
            value={userFilter}
            onChange={setUserFilter}
          />
        )}
        <LogSearchInput onSearch={setSearchQuery} />

        <Box flex={'1'} />
        {showSyncPopover && (
          <SyncLogKeysPopover
            appId={appId}
            logKeys={logKeys}
            setLogKeys={setLogKeys}
            teamLogKeys={teamLogKeys?.logKeys?.length ? teamLogKeys?.logKeys : DefaultAppLogKeys}
            fetchLogKeys={fetchLogKeys}
          />
        )}
        <LogKeysConfigPopover
          logKeysList={logKeys.filter((item) => {
            if (item.key === AppLogKeysEnum.SOURCE && !showSourceSelector) return false;
            return true;
          })}
          setLogKeysList={setLogKeys}
        />

        <PopoverConfirm
          Trigger={<Button size={'md'}>{t('common:Export')}</Button>}
          showCancel
          content={
            isCursorSearchMode
              ? t('app:logs_export_confirm_tip_without_total')
              : t('app:logs_export_confirm_tip', { total })
          }
          onConfirm={exportLogs}
        />
      </Flex>

      <FixedTableContainer
        maxH="none"
        ref={virtualContainerRef}
        mt={[2, 4]}
        flex={'1 0 0'}
        footer={
          <>
            <FloatingActionBar
              pb={0}
              Controler={
                <HStack>
                  <Button
                    variant={'whiteDanger'}
                    onClick={() =>
                      openConfirmDelete({
                        onConfirm: () => handleDelete(chatIds),
                        customContent: t('app:confirm_delete_chats', {
                          n: chatIds.length
                        })
                      })()
                    }
                  >
                    {t('common:Delete')} ({chatIds.length})
                  </Button>
                </HStack>
              }
            >
              {!isCursorSearchMode && total > pageSize && (
                <Flex justifyContent={'center'}>
                  <Pagination />
                </Flex>
              )}
            </FloatingActionBar>
          </>
        }
      >
        {/* 按内容分配列宽，避免长 UID 将成员姓名压缩；不足一屏时仍铺满容器。 */}
        <Table variant={'simple'} fontSize={'sm'} w={'max-content'} minW={'100%'}>
          <Thead>
            <Tr>
              <Th>
                <Checkbox isChecked={isSelecteAll} onChange={selectAllTrigger} />
              </Th>
              {logKeys
                .filter((logKey) => logKey.enable)
                .map((logKey) => HeaderRenderMap[logKey.key])}
              <Th>{t('common:Action')}</Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'xs'}>
            {topPlaceholderHeight > 0 && (
              <Tr aria-hidden>
                <Td
                  colSpan={logKeys.filter((logKey) => logKey.enable).length + 2}
                  h={`${topPlaceholderHeight}px`}
                  p={0}
                  border={0}
                />
              </Tr>
            )}
            {virtualDataList.map(({ data: item }) => {
              const cellRenderMap = getCellRenderMap(item);
              return (
                <Tr
                  key={item._id}
                  h={`${logRowHeight}px`}
                  _hover={{ bg: 'myWhite.600' }}
                  {...getRowSelectionProps(item, {
                    onClick: () =>
                      setDetailLogData({
                        chatId: item.chatId,
                        feedbackUserName: getLogIdentity(item).name
                      })
                  })}
                >
                  <Td>
                    <HStack onClick={(e) => e.stopPropagation()}>
                      <Checkbox isChecked={isSelected(item)} onChange={() => toggleSelect(item)} />
                    </HStack>
                  </Td>
                  {logKeys
                    .filter((logKey) => logKey.enable)
                    .map((logKey) => cellRenderMap[logKey.key as AppLogKeysEnum])}
                  <Td onClick={(e) => e.stopPropagation()}>
                    <PopoverConfirm
                      content={t('app:confirm_delete_chat_content')}
                      type="delete"
                      onConfirm={() => handleDelete([item.chatId])}
                      Trigger={
                        <Flex>
                          <MyIconButton icon={'delete'} hoverColor={'red.600'} hoverBg="red.100" />
                        </Flex>
                      }
                    />
                  </Td>
                </Tr>
              );
            })}
            {bottomPlaceholderHeight > 0 && (
              <Tr aria-hidden>
                <Td
                  colSpan={logKeys.filter((logKey) => logKey.enable).length + 2}
                  h={`${bottomPlaceholderHeight}px`}
                  p={0}
                  border={0}
                />
              </Tr>
            )}
          </Tbody>
        </Table>
        {isCursorSearchMode && (
          <Box mt={2} h={8} position={'relative'} fontSize={'xs'} color={'blackAlpha.500'}>
            {searchResult.loading ? (
              <MyLoading fixed={false} bg={'transparent'} size={'md'} />
            ) : searchResult.error ? (
              <Flex alignItems={'center'} justifyContent={'center'} gap={1}>
                <Box>{t('common:load_failed')}</Box>
                <Box
                  as={'button'}
                  type={'button'}
                  color={'primary.600'}
                  cursor={'pointer'}
                  onClick={() => loadSearchPage({ reset: searchResult.list.length === 0 })}
                >
                  {t('common:refresh')}
                </Box>
              </Flex>
            ) : (
              !searchResult.nextCursor && <Box textAlign={'center'}>{t('common:request_end')}</Box>
            )}
          </Box>
        )}
        {!isCursorSearchMode && logs.length === 0 && !isLoading && (
          <EmptyTip text={t('app:logs_empty')}></EmptyTip>
        )}
      </FixedTableContainer>

      {!!detailLogData && (
        <DetailLogsModal
          appId={appId}
          chatId={detailLogData.chatId}
          feedbackUserName={detailLogData.feedbackUserName}
          onClose={() => {
            setDetailLogData(undefined);
            refreshCurrentList();
          }}
        />
      )}

      <ConfirmDeleteModal />
    </Flex>
  );
};

export default React.memo(LogTable);
