import React, { useEffect, useMemo, useState } from 'react';
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
  Button
} from '@chakra-ui/react';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getAppChatLogs } from '@/web/core/app/api';
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
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { downloadFetch } from '@/web/common/system/utils';

const DetailLogsModal = dynamic(() => import('./DetailLogsModal'));

const Logs = () => {
  const { t } = useTranslation();

  const appId = useContextSelector(AppContext, (v) => v.appId);

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });

  const [detailLogsId, setDetailLogsId] = useState<string>();
  const [logTitle, setLogTitle] = useState<string>();

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
      logTitle
    }),
    [appId, chatSources, dateRange.from, dateRange.to, isSelectAllSource, logTitle]
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
          logTitle,

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
      refreshDeps: [chatSources, logTitle]
    }
  );
  console.log(dateRange, 111);
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
      <Flex flexDir={['column', 'row']} alignItems={['flex-start', 'center']} gap={3}>
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
            {t('app:logs_source')}
          </Box>
          <Box>
            <MultipleSelect<ChatSourceEnum>
              list={sourceList}
              value={chatSources}
              onSelect={setChatSources}
              isSelectAll={isSelectAllSource}
              setIsSelectAll={setIsSelectAllSource}
              itemWrap={false}
              height={'32px'}
              bg={'myGray.50'}
              w={'160px'}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
            {t('common:user.Time')}
          </Box>
          <DateRangePicker
            defaultDate={dateRange}
            position="bottom"
            onSuccess={(date) => {
              setDateRange(date);
            }}
          />
        </Flex>
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} whiteSpace={'nowrap'}>
            {t('app:logs_title')}
          </Box>
          <SearchInput
            placeholder={t('app:logs_title')}
            w={'240px'}
            value={logTitle}
            onChange={(e) => setLogTitle(e.target.value)}
          />
        </Flex>
        <Box flex={'1'} />
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
              <Th>{t('common:core.app.logs.Source And Time')}</Th>
              <Th>{t('app:logs_chat_user')}</Th>
              <Th>{t('app:logs_title')}</Th>
              <Th>{t('app:logs_message_total')}</Th>
              <Th>{t('app:feedback_count')}</Th>
              <Th>{t('common:core.app.feedback.Custom feedback')}</Th>
              <Th>
                <Flex gap={1} alignItems={'center'}>
                  {t('app:mark_count')}
                  <QuestionTip label={t('common:core.chat.Mark Description')} />
                </Flex>
              </Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'xs'}>
            {logs.map((item) => (
              <Tr
                key={item._id}
                _hover={{ bg: 'myWhite.600' }}
                cursor={'pointer'}
                title={t('common:core.view_chat_detail')}
                onClick={() => setDetailLogsId(item.id)}
              >
                <Td>
                  {/* @ts-ignore */}
                  <Box>{item.sourceName || t(ChatSourceMap[item.source]?.name) || item.source}</Box>
                  <Box color={'myGray.500'}>{dayjs(item.time).format('YYYY/MM/DD HH:mm')}</Box>
                </Td>
                <Td>
                  <Box>
                    {!!item.outLinkUid ? (
                      item.outLinkUid
                    ) : (
                      <UserBox sourceMember={item.sourceMember} />
                    )}
                  </Box>
                </Td>
                <Td className="textEllipsis" maxW={'250px'}>
                  {item.customTitle || item.title}
                </Td>
                <Td>{item.messageCount}</Td>
                <Td w={'100px'}>
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
                      <MyIcon
                        mr={1}
                        name={'core/chat/feedback/goodLight'}
                        color={'green.600'}
                        w={'14px'}
                      />
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
                      <MyIcon
                        mr={1}
                        name={'core/chat/feedback/badLight'}
                        color={'#C96330'}
                        w={'14px'}
                      />
                      {item.userBadFeedbackCount}
                    </Flex>
                  )}
                  {!item?.userGoodFeedbackCount && !item?.userBadFeedbackCount && <>-</>}
                </Td>
                <Td>{item.customFeedbacksCount || '-'}</Td>
                <Td>{item.markCount}</Td>
              </Tr>
            ))}
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
