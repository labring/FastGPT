import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Checkbox
} from '@chakra-ui/react';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useLocalStorageState } from 'ahooks';
import { getLogKeys } from '@/web/core/app/api/log';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  AppLogKeysEnum,
  AppLogKeysEnumMap,
  DefaultAppLogKeys
} from '@fastgpt/global/core/app/logs/constants';
import { isEqual } from 'lodash';
import SyncLogKeysPopover from './SyncLogKeysPopover';
import LogKeysConfigPopover from './LogKeysConfigPopover';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { downloadFetch } from '@/web/common/system/utils';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getAppChatLogs } from '@/web/core/app/api/log';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import type { AppLogsListItemType } from '@fastgpt/global/openapi/core/app/log/api';
import dayjs from 'dayjs';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import dynamic from 'next/dynamic';
import type { HeaderControlProps } from './LogChart';
import FeedbackTypeFilter from './FeedbackTypeFilter';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { batchDeleteChatHistories } from '@/web/core/chat/history/api';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

const DetailLogsModal = dynamic(() => import('./DetailLogsModal'));

const LogTable = ({
  appId,
  chatSources,
  setChatSources,
  isSelectAllSource,
  setIsSelectAllSource,
  dateRange,
  setDateRange,
  showSourceSelector = true,
  px = [4, 8]
}: HeaderControlProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [detailLogsId, setDetailLogsId] = useState<string>();
  const appName = useContextSelector(AppContext, (v) => v.appDetail.name);
  const [feedbackType, setFeedbackType] = useState<'all' | 'has_feedback' | 'good' | 'bad'>('all');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  // source
  const sourceList = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  // member
  const [tmbInputValue, setTmbInputValue] = useState('');
  const { data: members, ScrollData: TmbScrollData } = useScrollPagination(getTeamMembers, {
    params: { searchKey: tmbInputValue },
    refreshDeps: [tmbInputValue],
    disabled: !feConfigs?.isPlus
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
  const {
    value: selectTmbIds,
    setValue: setSelectTmbIds,
    isSelectAll: isSelectAllTmb,
    setIsSelectAll: setIsSelectAllTmb
  } = useMultipleSelect<string>([], true);

  // chat
  const [chatSearch, setChatSearch] = useState('');

  // log keys
  const [logKeys = DefaultAppLogKeys, setLogKeys] = useLocalStorageState<AppLogKeysType[]>(
    `app_log_keys_${appId}`
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
          setLogKeys(DefaultAppLogKeys);
        }
      }
    }
  );
  const showSyncPopover = useMemo(() => {
    const teamLogKeysList = (
      teamLogKeys?.logKeys?.length ? teamLogKeys?.logKeys : DefaultAppLogKeys
    ).filter((item) => item.enable);
    const personalLogKeysList = logKeys.filter((item) => item.enable);
    return !isEqual(teamLogKeysList, personalLogKeysList);
  }, [teamLogKeys, logKeys]);

  const { runAsync: exportLogs } = useRequest2(async () => {
    const enabledKeys = logKeys.filter((item) => item.enable).map((item) => item.key);
    const headerTitle = enabledKeys.map((k) => t(AppLogKeysEnumMap[k])).join(',');
    await downloadFetch({
      url: '/api/core/app/logs/exportLogs',
      filename: t('app:export_log_filename', { name: appName }),
      body: {
        appId,
        dateStart: dayjs(dateRange.from || new Date()).format(),
        dateEnd: dayjs(dateRange.to || new Date()).format(),
        sources: isSelectAllSource ? undefined : chatSources,
        tmbIds: isSelectAllTmb ? undefined : selectTmbIds,
        chatSearch,
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
        unreadOnly
      }
    });
  });
  const params = useMemoEnhance(
    () => ({
      appId,
      dateStart: dateRange.from!,
      dateEnd: dateRange.to!,
      sources: isSelectAllSource ? undefined : chatSources,
      tmbIds: isSelectAllTmb ? undefined : selectTmbIds,
      chatSearch,
      feedbackType,
      unreadOnly: feedbackType === 'all' ? undefined : unreadOnly
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
      feedbackType,
      unreadOnly
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

  const {
    selectedItems,
    toggleSelect,
    isSelected,
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger
  } = useTableMultipleSelect({
    list: logs,
    getItemId: (item) => item._id
  });
  const chatIds = useMemoEnhance(() => selectedItems.map((item) => item.chatId), [selectedItems]);

  const { openConfirm: openConfirmDelete, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    type: 'delete'
  });

  const { runAsync: handleDelete } = useRequest2(
    async (chatIds: string[]) => {
      await batchDeleteChatHistories({ appId, chatIds });
      await getData(pageNum);
    },
    {
      successToast: t('common:delete_success')
    }
  );

  const HeaderRenderMap = useMemoEnhance(
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
      [AppLogKeysEnum.REGION]: <Th key={AppLogKeysEnum.REGION}>{t('app:logs_keys_region')}</Th>,
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
        <Th key={AppLogKeysEnum.ERROR_COUNT}>{t('app:logs_error_count')}</Th>
      ),
      [AppLogKeysEnum.POINTS]: <Th key={AppLogKeysEnum.POINTS}>{t('app:logs_points')}</Th>,
      [AppLogKeysEnum.VERSION_NAME]: (
        <Th key={AppLogKeysEnum.VERSION_NAME}>{t('app:logs_keys_versionName')}</Th>
      )
    }),
    [t, feedbackType, setFeedbackType, unreadOnly, setUnreadOnly]
  );

  const getCellRenderMap = useCallback(
    (item: AppLogsListItemType) => ({
      [AppLogKeysEnum.SOURCE]: (
        <Td key={AppLogKeysEnum.SOURCE}>
          {/* @ts-ignore */}
          {item.sourceName || t(ChatSourceMap[item.source]?.name) || item.source}
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
          <Box>
            {!!item.outLinkUid ? (
              item.outLinkUid
            ) : item.sourceMember ? (
              <UserBox sourceMember={item.sourceMember} />
            ) : (
              '-'
            )}
          </Box>
        </Td>
      ),
      [AppLogKeysEnum.REGION]: <Td key={AppLogKeysEnum.REGION}>{item.region || '-'}</Td>,
      [AppLogKeysEnum.TITLE]: (
        <Td key={AppLogKeysEnum.TITLE} className="textEllipsis" maxW={'250px'}>
          {item.customTitle || item.title}
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
                <MyIcon mr={1} name={'core/chat/feedback/goodLight'} color={'green.500'} w={4} />
                {item.userGoodFeedbackCount}
              </Flex>
            )}
            {!!item?.userBadFeedbackCount && (
              <Flex alignItems={'center'}>
                <MyIcon mr={1} name={'core/chat/feedback/badLight'} color={'yellow.500'} w={4} />
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
    [t]
  );

  return (
    <MyBox isLoading={isLoading} display={'flex'} flexDir={'column'} h={'full'} px={px}>
      <Flex alignItems={'center'} gap={3} flexWrap={'wrap'}>
        {showSourceSelector && (
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
        )}
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
        {feConfigs?.isPlus && (
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
              h={10}
              w={' 226px'}
              rounded={'8px'}
              formLabelFontSize={'sm'}
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
        )}
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
          content={t('app:logs_export_confirm_tip', { total })}
          onConfirm={exportLogs}
        />
      </Flex>

      <TableContainer mt={[2, 4]} flex={'1 0 0'} overflowY={'auto'}>
        <Table variant={'simple'} fontSize={'sm'}>
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
            {logs.map((item) => {
              const cellRenderMap = getCellRenderMap(item);
              return (
                <Tr
                  key={item._id}
                  _hover={{ bg: 'myWhite.600' }}
                  cursor={'pointer'}
                  onClick={() => setDetailLogsId(item.chatId)}
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
          </Tbody>
        </Table>
        {logs.length === 0 && !isLoading && <EmptyTip text={t('app:logs_empty')}></EmptyTip>}
      </TableContainer>

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
        {total > pageSize && (
          <Flex justifyContent={'center'}>
            <Pagination />
          </Flex>
        )}
      </FloatingActionBar>

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

      <ConfirmDeleteModal />
    </MyBox>
  );
};

export default React.memo(LogTable);
