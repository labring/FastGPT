/**
 * @file 日志列表组件
 * @description 智能客服应用的对话日志列表页面，支持日期、反馈、来源等多维度筛选和搜索功能
 */
import {
  Box,
  Flex,
  HStack,
  Input,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import { useLocalStorageState } from 'ahooks';
import { getLogKeys } from '@/web/core/app/api/log';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { AppLogKeysEnum, DefaultAssistantLogKey } from '@fastgpt/global/core/app/logs/constants';
import { isEqual } from 'lodash';
import SyncLogKeysPopover from '../Logs/SyncLogKeysPopover';
import LogKeysConfigPopover from '../Logs/LogKeysConfigPopover';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getAppChatLogs } from '@/web/core/app/api/log';
import type { AppLogsListItemType } from '@/types/app';
import dayjs from 'dayjs';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import dynamic from 'next/dynamic';
import { FeedbackFilterEnum } from '@fastgpt/global/core/chat/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';

const DetailLogsModal = dynamic(() => import('./DetailLogs'));

// 反馈筛选组件
const FeedbackSelect = ({
  value,
  onChange,
  isSelectAll,
  setIsSelectAll
}: {
  value: FeedbackFilterEnum[];
  onChange: (value: FeedbackFilterEnum[]) => void;
  isSelectAll: boolean;
  setIsSelectAll: (value: boolean) => void;
}) => {
  const { t } = useTranslation();
  // 反馈筛选选项列表
  const feedbackList = [
    { label: t('app:logs_good_feedback'), value: FeedbackFilterEnum.good },
    { label: t('app:logs_bad_feedback'), value: FeedbackFilterEnum.bad },
    { label: t('app:logs_keys_feedback_none'), value: FeedbackFilterEnum.noFeedback }
  ];

  return (
    <MultipleSelect<FeedbackFilterEnum>
      list={feedbackList}
      value={value}
      onSelect={onChange}
      isSelectAll={isSelectAll}
      setIsSelectAll={(value) => setIsSelectAll(value as boolean)}
      h={10}
      w={'226px'}
      bg={'white'}
      rounded={'8px'}
      tagStyle={{
        px: 1,
        py: 1,
        borderRadius: 'sm',
        bg: 'myGray.100',
        color: 'myGray.900'
      }}
      borderColor={'myGray.200'}
      formLabel={t('app:logs_keys_feedback_column')}
      formLabelFontSize={'sm'}
    />
  );
};

const LogList = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [detailLogsId, setDetailLogsId] = useState<string>();
  const appId = useContextSelector(AppContext, (v) => v.appId);

  // source
  const sourceList = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  const {
    value: chatSources,
    setValue: setChatSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<ChatSourceEnum>(Object.values(ChatSourceEnum), true);

  // member
  const [tmbInputValue, setTmbInputValue] = useState('');
  const { data: members } = useScrollPagination(getTeamMembers, {
    params: { searchKey: tmbInputValue },
    disabled: !feConfigs?.isPlus
  });
  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <HStack spacing={1}>
            <Box color={'myGray.900'} className="textEllipsis">
              {item.memberName}
            </Box>
          </HStack>
        ),
        value: item.tmbId
      })),
    [members]
  );
  const {
    value: selectTmbIds,
    setValue: setSelectTmbIds,
    isSelectAll: isSelectAllTmb,
    setIsSelectAll: setIsSelectAllTmb
  } = useMultipleSelect<string>([], true);

  // feedback
  const {
    value: feedbackFilters,
    setValue: setFeedbackFilters,
    isSelectAll: isSelectAllFeedback,
    setIsSelectAll: setIsSelectAllFeedback
  } = useMultipleSelect<FeedbackFilterEnum>(Object.values(FeedbackFilterEnum), true);

  // chat
  const [chatSearch, setChatSearch] = useState('');

  // date range
  const [dateRange, setDateRange] = useState({
    from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });

  // log keys
  const [logKeys = DefaultAssistantLogKey, setLogKeys] = useLocalStorageState<AppLogKeysType[]>(
    `app_assistant_log_keys_${appId}`
  );
  const { runAsync: fetchLogKeys, data: teamLogKeys } = useRequest2(
    async () => {
      return getLogKeys({ appId });
    },
    {
      manual: false,
      refreshDeps: [appId],
      onSuccess: (res) => {
        if (logKeys.length > 0) return;
        if (res.logKeys.length > 0) {
          setLogKeys(res.logKeys);
        } else if (res.logKeys.length === 0) {
          setLogKeys(DefaultAssistantLogKey);
        }
      }
    }
  );
  const showSyncPopover = useMemo(() => {
    const teamLogKeysList = (
      teamLogKeys?.logKeys?.length ? teamLogKeys?.logKeys : DefaultAssistantLogKey
    ).filter((item) => item.enable);
    const personalLogKeysList = logKeys.filter((item) => item.enable);
    return !isEqual(teamLogKeysList, personalLogKeysList);
  }, [teamLogKeys, logKeys]);

  const params = useMemo(
    () => ({
      appId,
      dateStart: dateRange.from!,
      dateEnd: dateRange.to!,
      sources: isSelectAllSource ? undefined : chatSources,
      tmbIds: isSelectAllTmb ? undefined : selectTmbIds,
      chatSearch,
      feedbackFilters: isSelectAllFeedback ? undefined : feedbackFilters
    }),
    [
      appId,
      chatSources,
      dateRange.from,
      dateRange.to,
      isSelectAllSource,
      selectTmbIds,
      isSelectAllTmb,
      chatSearch,
      feedbackFilters,
      isSelectAllFeedback
    ]
  );

  const {
    data: logs,
    isLoading,
    Pagination,
    getData,
    pageNum,
    total,
    pageSize
  } = usePagination(getAppChatLogs, {
    defaultPageSize: 20,
    params,
    refreshDeps: [params]
  });

  const HeaderRenderMap: Record<string, React.ReactNode> = useMemo(
    () => ({
      [AppLogKeysEnum.SOURCE]: <Th key={AppLogKeysEnum.SOURCE}>{t('app:logs_keys_source')}</Th>,
      [AppLogKeysEnum.CREATED_TIME]: (
        <Th key={AppLogKeysEnum.CREATED_TIME}>{t('app:logs_keys_createdTime')}</Th>
      ),
      [AppLogKeysEnum.LAST_CONVERSATION_TIME]: (
        <Th key={AppLogKeysEnum.LAST_CONVERSATION_TIME}>
          {t('app:logs_keys_lastConversationTime')}
        </Th>
      ),
      [AppLogKeysEnum.USER]: <Th key={AppLogKeysEnum.USER}>{t('app:logs_chat_user')}</Th>,
      [AppLogKeysEnum.TITLE]: (
        <Th w={'336px'} key={AppLogKeysEnum.TITLE}>
          {t('app:logs_title')}
        </Th>
      ),
      [AppLogKeysEnum.MESSAGE_COUNT]: (
        <Th key={AppLogKeysEnum.MESSAGE_COUNT}>{t('app:logs_message_total')}</Th>
      ),
      [AppLogKeysEnum.FEEDBACK]: (
        <Th key={AppLogKeysEnum.FEEDBACK}>{t('app:logs_keys_feedback_all')}</Th>
      ),
      [AppLogKeysEnum.OPTIMIZED_COUNT]: (
        <Th key={AppLogKeysEnum.OPTIMIZED_COUNT}>{t('app:logs_keys_optimizedCount')}</Th>
      ),
      [AppLogKeysEnum.RESPONSE_TIME]: (
        <Th key={AppLogKeysEnum.RESPONSE_TIME}>{t('app:logs_response_time')}</Th>
      ),
      [AppLogKeysEnum.ERROR_COUNT]: (
        <Th key={AppLogKeysEnum.ERROR_COUNT}>{t('app:logs_error_count')}</Th>
      )
    }),
    [t]
  );

  const getCellRenderMap = (item: AppLogsListItemType): Record<string, React.ReactNode> => ({
    [AppLogKeysEnum.SOURCE]: (
      <Td key={AppLogKeysEnum.SOURCE}>
        {/* @ts-ignore */}
        {item.sourceName || t(ChatSourceMap[item.source]?.name) || item.source}
      </Td>
    ),
    [AppLogKeysEnum.CREATED_TIME]: (
      <Td key={AppLogKeysEnum.CREATED_TIME}>
        {dayjs(item.createTime).format('YYYY-MM-DD HH:mm:ss')}
      </Td>
    ),
    [AppLogKeysEnum.LAST_CONVERSATION_TIME]: (
      <Td key={AppLogKeysEnum.LAST_CONVERSATION_TIME}>
        {dayjs(item.updateTime).format('YYYY-MM-DD HH:mm:ss')}
      </Td>
    ),
    [AppLogKeysEnum.USER]: (
      <Td key={AppLogKeysEnum.USER}>
        <Box>
          {!!item.outLinkUid ? item.outLinkUid : <UserBox sourceMember={item.sourceMember} />}
        </Box>
      </Td>
    ),
    [AppLogKeysEnum.TITLE]: (
      <Td w={'336px'} key={AppLogKeysEnum.TITLE} className="textEllipsis" maxW={'336px'}>
        {item.customTitle || item.title}
      </Td>
    ),
    [AppLogKeysEnum.MESSAGE_COUNT]: <Td key={AppLogKeysEnum.MESSAGE_COUNT}>{item.messageCount}</Td>,
    [AppLogKeysEnum.FEEDBACK]: (
      <Td key={AppLogKeysEnum.FEEDBACK} w={'100px'}>
        <Flex>
          {!!item?.userGoodFeedbackCount && (
            <Flex
              mb={item?.userGoodFeedbackCount ? 1 : 0}
              px={2}
              py={1}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={'md'}
              fontWeight={'bold'}
            >
              <MyIcon
                mr={1}
                name={'core/chat/feedback/goodLight'}
                color={'yellow.500'}
                w={'16px'}
              />
              {item.userGoodFeedbackCount}
            </Flex>
          )}
          {!!item?.userBadFeedbackCount && (
            <Flex
              px={2}
              py={1}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={'md'}
              fontWeight={'bold'}
            >
              <MyIcon mr={1} name={'core/chat/feedback/badLight'} color={'green.500'} w={'16px'} />
              {item.userBadFeedbackCount}
            </Flex>
          )}
          {!item?.userGoodFeedbackCount && !item?.userBadFeedbackCount && <>-</>}
        </Flex>
      </Td>
    ),
    [AppLogKeysEnum.OPTIMIZED_COUNT]: (
      <Td key={AppLogKeysEnum.OPTIMIZED_COUNT}>{item.correctionCount || 0}</Td>
    ),
    [AppLogKeysEnum.RESPONSE_TIME]: (
      <Td key={AppLogKeysEnum.RESPONSE_TIME}>
        {item.averageResponseTime ? `${item.averageResponseTime.toFixed(2)}s` : '-'}
      </Td>
    ),
    [AppLogKeysEnum.ERROR_COUNT]: <Td key={AppLogKeysEnum.ERROR_COUNT}>{item.errorCount || '-'}</Td>
  });

  return (
    <MyBox isLoading={isLoading} display={'flex'} flexDir={'column'} h={'full'} px={[4, 8]}>
      <Flex alignItems={'center'} gap={3} flexWrap={'wrap'}>
        {/* 日期筛选 - 置前 */}
        <Flex>
          <DateRangePicker
            defaultDate={dateRange}
            onSuccess={(date) => {
              setDateRange(date);
            }}
            bg={'myGray.25'}
            h={10}
            flex={'0 1 250px'}
            rounded={'8px'}
            borderColor={'myGray.200'}
            formLabel={t('app:logs_date')}
            _hover={{
              borderColor: 'primary.300'
            }}
          />
        </Flex>

        {/* 反馈筛选 */}
        <Flex>
          <FeedbackSelect
            value={feedbackFilters}
            onChange={setFeedbackFilters}
            isSelectAll={isSelectAllFeedback}
            setIsSelectAll={setIsSelectAllFeedback}
          />
        </Flex>

        {/* 来源筛选 */}
        <Flex>
          <MultipleSelect<ChatSourceEnum>
            list={sourceList}
            value={chatSources}
            onSelect={setChatSources}
            isSelectAll={isSelectAllSource}
            setIsSelectAll={setIsSelectAllSource}
            h={10}
            w={'200px'}
            rounded={'8px'}
            tagStyle={{
              px: 1,
              py: 1,
              borderRadius: 'sm',
              bg: 'myGray.100',
              color: 'myGray.900'
            }}
            borderColor={'myGray.200'}
            formLabel={t('app:logs_source')}
            formLabelFontSize={'sm'}
          />
        </Flex>

        {/* 搜索 */}
        <Flex
          flex={'0 1 230px'}
          h={10}
          alignItems={'center'}
          rounded={'8px'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          _focusWithin={{
            borderColor: 'primary.600',
            boxShadow: '0 0 0 2.4px rgba(51, 112, 255, 0.15)'
          }}
          pl={3}
        >
          <Box rounded={'8px'} bg={'white'} fontSize={'sm'} border={'none'} whiteSpace={'nowrap'}>
            {t('common:chat')}
          </Box>
          <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
          <Input
            placeholder={t('app:logs_search_title')}
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            fontSize={'sm'}
            border={'none'}
            pl={0}
            _focus={{
              boxShadow: 'none'
            }}
            _placeholder={{
              fontSize: 'sm'
            }}
          />
        </Flex>
        <Box flex={'1'} />
        {showSyncPopover && (
          <SyncLogKeysPopover
            logKeys={logKeys}
            setLogKeys={setLogKeys}
            teamLogKeys={
              teamLogKeys?.logKeys?.length ? teamLogKeys?.logKeys : DefaultAssistantLogKey
            }
            fetchLogKeys={fetchLogKeys}
          />
        )}
        <LogKeysConfigPopover
          logKeysList={logKeys}
          setLogKeysList={setLogKeys}
          isAssistant={true}
        />
      </Flex>

      <TableContainer mt={[2, 4]} flex={'1 0 0'} overflowY={'auto'}>
        <Table variant={'simple'} fontSize={'sm'}>
          <Thead>
            <Tr>
              {logKeys
                .filter((logKey) => logKey.enable)
                .map((logKey) => HeaderRenderMap[logKey.key])}
            </Tr>
          </Thead>
          <Tbody fontSize={'xs'}>
            {logs.map((item) => {
              const cellRenderMap = getCellRenderMap(item);
              return (
                <Tr
                  key={item._id}
                  _hover={{ bg: 'myWhite.600' }}
                  cursor={'pointer'}
                  title={t('common:core.view_chat_detail')}
                  onClick={() => setDetailLogsId(item.id)}
                >
                  {logKeys
                    .filter((logKey) => logKey.enable)
                    .map((logKey) => cellRenderMap[logKey.key])}
                </Tr>
              );
            })}
          </Tbody>
        </Table>
        {logs.length === 0 && !isLoading && <EmptyTip text={t('app:logs_empty')}></EmptyTip>}
      </TableContainer>

      {total >= pageSize && (
        <Flex mt={3} justifyContent={'center'}>
          <Pagination />
        </Flex>
      )}

      {!!detailLogsId && (
        <DetailLogsModal
          appId={appId}
          chatId={detailLogsId}
          onClose={() => {
            setDetailLogsId(undefined);
          }}
        />
      )}
    </MyBox>
  );
};

export default React.memo(LogList);
