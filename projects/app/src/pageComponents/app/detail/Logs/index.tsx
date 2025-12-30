import React, { useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import LogTable from './LogTable';
import LogChart from './LogChart';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { useMultipleSelect } from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ProTag from '@/components/ProTip/Tag';
import ProText from '@/components/ProTip/ProText';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';

const Logs = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [viewMode, setViewMode] = useState<'chart' | 'table'>(feConfigs.isPlus ? 'chart' : 'table');
  const appId = useContextSelector(AppContext, (v) => v.appId);

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });

  const {
    value: chatSources,
    setValue: setChatSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<ChatSourceEnum>(Object.values(ChatSourceEnum), true);

  return (
    <Flex flexDirection={'column'} h={'full'} rounded={'lg'} py={[4, 6]}>
      <Flex px={[4, 8]}>
        <Flex
          w={'full'}
          gap={2}
          pb={4}
          mb={4}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          alignItems={'center'}
        >
          <Flex flex={'1 0 0'} gap={2}>
            <Flex
              px={2}
              py={2}
              cursor={'pointer'}
              color={viewMode === 'chart' ? 'primary.600' : 'myGray.500'}
              onClick={() => setViewMode('chart')}
              borderRadius={'8px'}
              bg={viewMode === 'chart' ? 'myGray.05' : 'transparent'}
              _hover={{ bg: 'myGray.05' }}
            >
              <MyIcon name={'core/app/logsLight'} w={4} />
              <Box ml={2} mr={0.5}>
                {t('app:logs_app_data')}
              </Box>
              <ProTag />
            </Flex>
            <Flex
              px={2}
              py={2}
              cursor={'pointer'}
              color={viewMode === 'table' ? 'primary.600' : 'myGray.500'}
              onClick={() => setViewMode('table')}
              gap={2}
              borderRadius={'8px'}
              bg={viewMode === 'table' ? 'myGray.05' : 'transparent'}
              _hover={{ bg: 'myGray.05' }}
            >
              <MyIcon name={'core/app/logsLight'} w={4} />
              {t('app:log_detail')}
            </Flex>
          </Flex>
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
        </Flex>
      </Flex>
      {viewMode === 'table' ? (
        <LogTable
          appId={appId}
          chatSources={chatSources}
          setChatSources={setChatSources}
          isSelectAllSource={isSelectAllSource}
          setIsSelectAllSource={setIsSelectAllSource}
          dateRange={dateRange}
          setDateRange={setDateRange}
        />
      ) : (
        <LogChart
          appId={appId}
          chatSources={chatSources}
          setChatSources={setChatSources}
          isSelectAllSource={isSelectAllSource}
          setIsSelectAllSource={setIsSelectAllSource}
          dateRange={dateRange}
          setDateRange={setDateRange}
        />
      )}
    </Flex>
  );
};

export default React.memo(Logs);
