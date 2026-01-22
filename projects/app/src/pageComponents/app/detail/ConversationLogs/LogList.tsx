/**
 * @file 日志列表组件
 * @description 智能客服应用的对话日志列表页面，显示筛选后的日志数据
 */
import { Box, Flex, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import React, { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getAppChatLogs } from '@/web/core/app/api/log';
import type { AppLogsListItemType } from '@/types/app';
import dayjs from 'dayjs';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import type { LogFiltersType } from './LogFilters';
import { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';

const DetailLogsModal = dynamic(() => import('./DetailLogs'));

interface LogListProps {
  filters: LogFiltersType | null;
}

const LogList: React.FC<LogListProps> = ({ filters }) => {
  const { t } = useTranslation();
  const [detailLogsId, setDetailLogsId] = useState<string>();
  const appId = useContextSelector(AppContext, (v) => v.appId);

  // 根据传入的筛选条件生成请求参数
  const params = useMemo(() => {
    if (!filters) return null;

    return {
      appId,
      dateStart: filters.dateRange.from!,
      dateEnd: filters.dateRange.to!,
      sources: filters.isSelectAllSource ? undefined : filters.chatSources,
      tmbIds: filters.isSelectAllTmb ? undefined : filters.selectTmbIds,
      chatSearch: filters.chatSearch,
      feedbackFilter: filters.isSelectAllFeedback ? undefined : filters.feedbackFilters
    };
  }, [appId, filters]);

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
    params: params || undefined,
    refreshDeps: [params],
    defaultRequest: !!appId && !!filters
  });

  const HeaderRenderMap: Record<string, React.ReactNode> = useMemo(() => {
    if (!filters?.logKeys) return {};

    return {
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
        <Th key={AppLogKeysEnum.FEEDBACK}>{t('app:logs_keys_feedback')}</Th>
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
    };
  }, [t, filters?.logKeys]);

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
          {!!item.outLinkUid ? (
            item.outLinkUid
          ) : (
            <Box maxW={'150px'} whiteSpace={'nowrap'} overflow={'hidden'}>
              {item.sourceMember.name}
            </Box>
          )}
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
              borderRadius={'sm'}
            >
              <MyIcon mr={1} name={'core/chat/feedback/goodLight'} w={'16px'} color={'green.500'} />
              {item.userGoodFeedbackCount}
            </Flex>
          )}
          {!!item?.userBadFeedbackCount && (
            <Flex
              px={2}
              py={1}
              alignItems={'center'}
              alignSelf={'baseline'}
              justifyContent={'center'}
              borderRadius={'sm'}
            >
              <MyIcon color={'yellow.500'} mr={1} name={'core/chat/feedback/badLight'} w={'16px'} />
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
    <MyBox px={[4, 8]} isLoading={isLoading} display={'flex'} flexDir={'column'} h={'full'}>
      <TableContainer flex={'1 0 0'} overflowY={'auto'}>
        <Table variant={'simple'} fontSize={'sm'}>
          <Thead>
            <Tr>
              {filters?.logKeys
                .filter((logKey) => logKey.enable)
                .map((logKey) => HeaderRenderMap[logKey.key])}
            </Tr>
          </Thead>
          <Tbody fontSize={'xs'}>
            {logs?.map((item) => {
              const cellRenderMap = getCellRenderMap(item);
              return (
                <Tr
                  key={item._id}
                  _hover={{ bg: 'myWhite.600' }}
                  cursor={'pointer'}
                  title={t('common:core.view_chat_detail')}
                  onClick={() => setDetailLogsId(item.id)}
                >
                  {filters?.logKeys
                    .filter((logKey) => logKey.enable)
                    .map((logKey) => cellRenderMap[logKey.key])}
                </Tr>
              );
            })}
          </Tbody>
        </Table>
        {(!logs || logs.length === 0) && !isLoading && (
          <EmptyTip text={t('app:logs_empty')}></EmptyTip>
        )}
      </TableContainer>

      {total && total >= pageSize && (
        <Flex mt={3} justifyContent={'center'}>
          <Pagination />
        </Flex>
      )}

      {!!detailLogsId && (
        <DetailLogsModal
          appId={appId}
          chatId={detailLogsId}
          title={logs?.find((item) => item.id === detailLogsId)?.customTitle}
          onClose={() => {
            setDetailLogsId(undefined);
          }}
        />
      )}
    </MyBox>
  );
};

export default React.memo(LogList);
