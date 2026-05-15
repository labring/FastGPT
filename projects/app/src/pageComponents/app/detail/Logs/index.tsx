import React from 'react';
import { Box, Button, Flex, HStack, Input } from '@chakra-ui/react';
import LogTable from './LogTable';
import LogChart from './LogChart';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ProTag from '@/components/ProTip/Tag';
import ProText from '@/components/ProTip/ProText';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useLocalStorageState } from 'ahooks';
import { LogsContext, LogsContextProvider } from './context';
import UserFilter from './UserFilter';
import SyncLogKeysPopover from './SyncLogKeysPopover';
import LogKeysConfigPopover from './LogKeysConfigPopover';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { AppLogKeysEnum, DefaultAppLogKeys } from '@fastgpt/global/core/app/logs/constants';
import { useMemo } from 'react';

const LogsInner = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const [viewMode, setViewMode] = useLocalStorageState<'chart' | 'table'>(`app_log_view_mode`, {
    defaultValue: feConfigs.isPlus ? 'chart' : 'table'
  });

  const dateRange = useContextSelector(LogsContext, (v) => v.dateRange);
  const setDateRange = useContextSelector(LogsContext, (v) => v.setDateRange);
  const chatSources = useContextSelector(LogsContext, (v) => v.chatSources);
  const setChatSources = useContextSelector(LogsContext, (v) => v.setChatSources);
  const isSelectAllSource = useContextSelector(LogsContext, (v) => v.isSelectAllSource);
  const setIsSelectAllSource = useContextSelector(LogsContext, (v) => v.setIsSelectAllSource);
  const chatSearch = useContextSelector(LogsContext, (v) => v.chatSearch);
  const setChatSearch = useContextSelector(LogsContext, (v) => v.setChatSearch);
  const selectedUsers = useContextSelector(LogsContext, (v) => v.selectedUsers);
  const setSelectedUsers = useContextSelector(LogsContext, (v) => v.setSelectedUsers);
  const isSelectAllUser = useContextSelector(LogsContext, (v) => v.isSelectAllUser);
  const setIsSelectAllUser = useContextSelector(LogsContext, (v) => v.setIsSelectAllUser);
  const logKeys = useContextSelector(LogsContext, (v) => v.logKeys);
  const setLogKeys = useContextSelector(LogsContext, (v) => v.setLogKeys);
  const teamLogKeys = useContextSelector(LogsContext, (v) => v.teamLogKeys);
  const showSyncPopover = useContextSelector(LogsContext, (v) => v.showSyncPopover);
  const fetchLogKeys = useContextSelector(LogsContext, (v) => v.fetchLogKeys);
  const total = useContextSelector(LogsContext, (v) => v.total);
  const onExport = useContextSelector(LogsContext, (v) => v.onExport);

  const sourceList = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  return (
    <Flex flexDirection={'column'} h={'full'} rounded={'md'} pb={4} bg={'white'}>
      <Flex px={4} alignItems={'center'} flexShrink={0}>
        <HStack
          alignItems={'center'}
          py="18px"
          w="full"
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          {/* Tabs */}
          <FillRowTabs
            list={[
              {
                label: (
                  <Flex alignItems={'center'} gap={1} lineHeight={'24px'}>
                    {t('app:logs_app_data')}
                    <ProTag />
                  </Flex>
                ),
                value: 'chart' as const
              },
              {
                label: (
                  <Flex alignItems={'center'} gap={1} lineHeight={'24px'}>
                    {t('app:log_detail')}
                  </Flex>
                ),
                value: 'table' as const
              }
            ]}
            value={viewMode ?? 'table'}
            onChange={(v) => setViewMode(v)}
            h={'36px'}
            px={'8px'}
          />

          <HStack ml="auto">
            {/* Date filter */}
            <DateRangePicker
              defaultDate={dateRange}
              onSuccess={(date) => setDateRange(date)}
              bg={'white'}
              h={'36px'}
              rounded={'4px'}
              borderColor={'myGray.200'}
              _hover={{ borderColor: 'primary.300' }}
              w={'226px'}
            />
            {/* Source filter */}
            <Flex w="148px">
              <MultipleSelect<ChatSourceEnum>
                list={sourceList}
                value={chatSources}
                onSelect={setChatSources}
                isSelectAll={isSelectAllSource}
                setIsSelectAll={setIsSelectAllSource}
                h={'36px'}
                rounded={'4px'}
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
                flexShrink={0}
              />
            </Flex>

            {/* Table-only filters */}
            {viewMode === 'table' && (
              <>
                {feConfigs?.isPlus && (
                  <UserFilter
                    appId={appId}
                    w={'148px'}
                    dateRange={dateRange}
                    sources={isSelectAllSource ? undefined : chatSources}
                    selectedUsers={selectedUsers}
                    setSelectedUsers={setSelectedUsers}
                    isSelectAll={isSelectAllUser}
                    setIsSelectAll={setIsSelectAllUser}
                  />
                )}

                <Flex
                  flex={'0 1 148px'}
                  rounded={'4px'}
                  alignItems={'center'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  _focusWithin={{
                    borderColor: 'primary.600',
                    boxShadow: '0 0 0 2.4px rgba(51, 112, 255, 0.15)'
                  }}
                  pl={3}
                  h={'36px'}
                  flexShrink={0}
                >
                  <Box
                    rounded={'4px'}
                    bg={'white'}
                    fontSize={'sm'}
                    border={'none'}
                    whiteSpace={'nowrap'}
                  >
                    {t('common:Search')}
                  </Box>
                  <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
                  <Input
                    placeholder={t('app:logs_search_title')}
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    fontSize={'sm'}
                    border={'none'}
                    pl={0}
                    _focus={{ boxShadow: 'none' }}
                    _placeholder={{ fontSize: 'sm' }}
                  />
                </Flex>
              </>
            )}

            {/* Chart mode upgrade prompt */}
            {viewMode === 'chart' && !feConfigs.isPlus && (
              <ProText signKey={'app_log'}>
                <Flex alignItems={'center'} cursor={'pointer'}>
                  <Box color={'primary.600'} fontSize="sm" fontWeight={'medium'} mr={1}>
                    {t('common:upgrade')}
                  </Box>
                  <ProTag />
                </Flex>
              </ProText>
            )}
            {/* Table-only actions */}
            {viewMode === 'table' && (
              <>
                {showSyncPopover && (
                  <SyncLogKeysPopover
                    appId={appId}
                    logKeys={logKeys}
                    setLogKeys={setLogKeys as any}
                    teamLogKeys={
                      teamLogKeys?.logKeys?.length ? teamLogKeys.logKeys : DefaultAppLogKeys
                    }
                    fetchLogKeys={fetchLogKeys as any}
                  />
                )}
                <LogKeysConfigPopover
                  logKeysList={logKeys.filter(
                    (item) => item.key !== AppLogKeysEnum.OPTIMIZED_COUNT
                  )}
                  setLogKeysList={(value) =>
                    setLogKeys(typeof value === 'function' ? value(logKeys) : value)
                  }
                />
                {/* <PopoverConfirm
                  Trigger={
                    <Button h={'36px'} rounded="4px" variant={'whiteBase'}>
                      {t('common:Export')}
                    </Button>
                  }
                  showCancel
                  content={t('app:logs_export_confirm_tip', { total })}
                  onConfirm={onExport ?? (() => {})}
                /> */}
              </>
            )}
          </HStack>
        </HStack>
      </Flex>

      {viewMode === 'table' ? <LogTable /> : <LogChart />}
    </Flex>
  );
};

const Logs = () => {
  return (
    <LogsContextProvider>
      <LogsInner />
    </LogsContextProvider>
  );
};

export default React.memo(Logs);
