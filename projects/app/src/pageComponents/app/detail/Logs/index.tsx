import React, { useMemo, useState } from 'react';
import {
  Flex,
  Box,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  HStack,
  Button,
  Input
} from '@chakra-ui/react';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getAppChatLogs } from '@/web/core/app/api/log';
import dayjs from 'dayjs';
import { ChatSourceEnum, ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import { addDays } from 'date-fns';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { cardStyles } from '../constants';
import dynamic from 'next/dynamic';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { downloadFetch } from '@/web/common/system/utils';
import LogKeysConfigPopover from './LogKeysConfigPopover';
import { getLogKeys } from '@/web/core/app/api/log';
import { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import { DefaultAppLogKeys } from '@fastgpt/global/core/app/logs/constants';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useLocalStorageState } from 'ahooks';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import type { AppLogsListItemType } from '@/types/app';
import SyncLogKeysPopover from './SyncLogKeysPopover';
import { isEqual } from 'lodash';

const DetailLogsModal = dynamic(() => import('./DetailLogsModal'));

const Logs = () => {
  const { t } = useTranslation();

  const appId = useContextSelector(AppContext, (v) => v.appId);

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });

  const [detailLogsId, setDetailLogsId] = useState<string>();
  const [tmbInputValue, setTmbInputValue] = useState('');
  const [chatSearch, setChatSearch] = useState('');

  const getCellRenderMap = (item: AppLogsListItemType) => ({
    [AppLogKeysEnum.SOURCE]: (
      <Td key={AppLogKeysEnum.SOURCE}>
        {/* @ts-ignore */}
        {item.sourceName || t(ChatSourceMap[item.source]?.name) || item.source}
      </Td>
    ),
    [AppLogKeysEnum.CREATED_TIME]: (
      <Td key={AppLogKeysEnum.CREATED_TIME}>{dayjs(item.createTime).format('YYYY/MM/DD HH:mm')}</Td>
    ),
    [AppLogKeysEnum.LAST_CONVERSATION_TIME]: (
      <Td key={AppLogKeysEnum.LAST_CONVERSATION_TIME}>
        {dayjs(item.updateTime).format('YYYY/MM/DD HH:mm')}
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
      <Td key={AppLogKeysEnum.TITLE} className="textEllipsis" maxW={'250px'}>
        {item.customTitle || item.title}
      </Td>
    ),
    [AppLogKeysEnum.SESSION_ID]: (
      <Td key={AppLogKeysEnum.SESSION_ID} className="textEllipsis" maxW={'200px'}>
        {item.id || '-'}
      </Td>
    ),
    [AppLogKeysEnum.MESSAGE_COUNT]: <Td key={AppLogKeysEnum.MESSAGE_COUNT}>{item.messageCount}</Td>,
    [AppLogKeysEnum.FEEDBACK]: (
      <Td key={AppLogKeysEnum.FEEDBACK} w={'100px'}>
        {!!item?.userGoodFeedbackCount && (
          <Flex
            mb={item?.userGoodFeedbackCount ? 1 : 0}
            bg={'green.100'}
            color={'green.600'}
            px={3}
            py={1}
            alignItems={'center'}
            justifyContent={'center'}
            borderRadius={'md'}
            fontWeight={'bold'}
          >
            <MyIcon mr={1} name={'core/chat/feedback/goodLight'} color={'green.600'} w={'14px'} />
            {item.userGoodFeedbackCount}
          </Flex>
        )}
        {!!item?.userBadFeedbackCount && (
          <Flex
            bg={'#FFF2EC'}
            color={'#C96330'}
            px={3}
            py={1}
            alignItems={'center'}
            justifyContent={'center'}
            borderRadius={'md'}
            fontWeight={'bold'}
          >
            <MyIcon mr={1} name={'core/chat/feedback/badLight'} color={'#C96330'} w={'14px'} />
            {item.userBadFeedbackCount}
          </Flex>
        )}
        {!item?.userGoodFeedbackCount && !item?.userBadFeedbackCount && <>-</>}
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
    )
  });

  const {
    value: selectTmbIds,
    setValue: setSelectTmbIds,
    isSelectAll: isSelectAllTmb,
    setIsSelectAll: setIsSelectAllTmb
  } = useMultipleSelect<string>([], true);

  const {
    value: chatSources,
    setValue: setChatSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<ChatSourceEnum>(Object.values(ChatSourceEnum), true);

  const sourceList = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  const params = useMemo(
    () => ({
      appId,
      dateStart: dateRange.from!,
      dateEnd: dateRange.to!,
      sources: isSelectAllSource ? undefined : chatSources,
      tmbIds: isSelectAllTmb ? undefined : selectTmbIds,
      chatSearch
    }),
    [
      appId,
      chatSources,
      dateRange.from,
      dateRange.to,
      isSelectAllSource,
      selectTmbIds,
      isSelectAllTmb,
      chatSearch
    ]
  );
  const {
    data: logs,
    isLoading,
    Pagination,
    getData,
    pageNum,
    total
  } = usePagination(getAppChatLogs, {
    pageSize: 20,
    params,
    refreshDeps: [params]
  });

  const [logKeys = DefaultAppLogKeys, setLogKeys] = useLocalStorageState<AppLogKeysType[]>(
    `app_log_keys_${appId}`
  );
  const { runAsync: fetchLogKeys, data: teamLogKeys = [] } = useRequest2(
    async () => {
      const res = await getLogKeys({ appId });
      const keys = res.logKeys.length > 0 ? res.logKeys : DefaultAppLogKeys;
      setLogKeys(keys);
      return keys;
    },
    {
      manual: false,
      refreshDeps: [appId]
    }
  );

  const HeaderRenderMap = useMemo(
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
      [AppLogKeysEnum.TITLE]: <Th key={AppLogKeysEnum.TITLE}>{t('app:logs_title')}</Th>,
      [AppLogKeysEnum.SESSION_ID]: (
        <Th key={AppLogKeysEnum.SESSION_ID}>{t('app:logs_keys_sessionId')}</Th>
      ),
      [AppLogKeysEnum.MESSAGE_COUNT]: (
        <Th key={AppLogKeysEnum.MESSAGE_COUNT}>{t('app:logs_message_total')}</Th>
      ),
      [AppLogKeysEnum.FEEDBACK]: <Th key={AppLogKeysEnum.FEEDBACK}>{t('app:feedback_count')}</Th>,
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
        <Th key={AppLogKeysEnum.ERROR_COUNT}>{t('app:logs_error_count')}</Th>
      ),
      [AppLogKeysEnum.POINTS]: <Th key={AppLogKeysEnum.POINTS}>{t('app:logs_points')}</Th>
    }),
    [t]
  );

  const { runAsync: exportLogs } = useRequest2(
    async () => {
      await downloadFetch({
        url: '/api/core/app/exportChatLogs',
        filename: 'chat_logs.csv',
        body: {
          appId,
          dateStart: dateRange.from || new Date(),
          dateEnd: addDays(dateRange.to || new Date(), 1),
          sources: isSelectAllSource ? undefined : chatSources,
          tmbIds: isSelectAllTmb ? undefined : selectTmbIds,
          chatSearch,

          title: t('app:logs_export_title'),
          sourcesMap: Object.fromEntries(
            Object.entries(ChatSourceMap).map(([key, config]) => [
              key,
              {
                label: t(config.name as any)
              }
            ])
          )
        }
      });
    },
    {
      refreshDeps: [chatSources]
    }
  );

  const { data: members, ScrollData: TmbScrollData } = useScrollPagination(getTeamMembers, {
    params: { searchKey: tmbInputValue },
    refreshDeps: [tmbInputValue]
  });
  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <HStack spacing={1}>
            <Avatar src={item.avatar} w={'1.2rem'} rounded={'full'} />
            <Box color={'myGray.900'} className="textEllipsis">
              {item.memberName}
            </Box>
          </HStack>
        ),
        value: item.tmbId
      })),
    [members]
  );

  const showSyncPopover = useMemo(() => {
    const teamLogKeysList = teamLogKeys.filter((item) => item.enable);
    const personalLogKeysList = logKeys.filter((item) => item.enable);
    return !isEqual(teamLogKeysList, personalLogKeysList);
  }, [teamLogKeys, logKeys]);

  return (
    <Flex
      flexDirection={'column'}
      h={'100%'}
      {...cardStyles}
      boxShadow={3.5}
      px={[4, 8]}
      py={[4, 6]}
      flex={'1 0 0'}
    >
      <Flex alignItems={'center'} flexWrap={'wrap'} gap={3}>
        <Flex>
          <MultipleSelect<ChatSourceEnum>
            list={sourceList}
            value={chatSources}
            onSelect={setChatSources}
            isSelectAll={isSelectAllSource}
            setIsSelectAll={setIsSelectAllSource}
            h={9}
            w={'226px'}
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
          />
        </Flex>
        <Flex>
          <DateRangePicker
            defaultDate={dateRange}
            onSuccess={(date) => {
              setDateRange(date);
            }}
            bg={'white'}
            h={9}
            w={'240px'}
            rounded={'8px'}
            borderColor={'myGray.200'}
            formLabel={t('app:logs_date')}
            _hover={{
              borderColor: 'primary.300'
            }}
          />
        </Flex>
        <Flex>
          <MultipleSelect<string>
            list={tmbList}
            value={selectTmbIds}
            onSelect={(val) => {
              setSelectTmbIds(val as string[]);
            }}
            ScrollData={TmbScrollData}
            isSelectAll={isSelectAllTmb}
            setIsSelectAll={setIsSelectAllTmb}
            h={9}
            w={'226px'}
            rounded={'8px'}
            formLabel={t('common:member')}
            tagStyle={{
              px: 1,
              borderRadius: 'sm',
              bg: 'myGray.100',
              w: '76px'
            }}
            inputValue={tmbInputValue}
            setInputValue={setTmbInputValue}
          />
        </Flex>
        <Flex
          w={'226px'}
          h={9}
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
            placeholder={t('app:logs_search_chat')}
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
            teamLogKeys={teamLogKeys || []}
            fetchLogKeys={fetchLogKeys}
          />
        )}
        <LogKeysConfigPopover
          logKeysList={logKeys || DefaultAppLogKeys}
          setLogKeysList={setLogKeys}
        />

        <PopoverConfirm
          Trigger={<Button size={'md'}>{t('common:Export')}</Button>}
          showCancel
          content={t('app:logs_export_confirm_tip', { total })}
          onConfirm={exportLogs}
        />
      </Flex>

      <TableContainer mt={[2, 4]} flex={'1 0 0'} h={0} overflowY={'auto'}>
        <Table variant={'simple'} fontSize={'sm'}>
          <Thead>
            <Tr>
              {(logKeys || DefaultAppLogKeys)
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
                  {(logKeys || DefaultAppLogKeys)
                    .filter((logKey) => logKey.enable)
                    .map((logKey) => cellRenderMap[logKey.key])}
                </Tr>
              );
            })}
          </Tbody>
        </Table>
        {logs.length === 0 && !isLoading && <EmptyTip text={t('app:logs_empty')}></EmptyTip>}
      </TableContainer>

      <HStack w={'100%'} mt={3} justifyContent={'center'}>
        <Pagination />
      </HStack>

      {!!detailLogsId && (
        <DetailLogsModal
          appId={appId}
          chatId={detailLogsId}
          onClose={() => {
            setDetailLogsId(undefined);
            getData(pageNum);
          }}
        />
      )}
    </Flex>
  );
};

export default React.memo(Logs);
