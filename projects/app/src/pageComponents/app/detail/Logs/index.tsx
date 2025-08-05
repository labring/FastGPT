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
import ProModal from '@/components/ProModal';

const Logs = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [viewMode, setViewMode] = useState<'chart' | 'table'>(feConfigs.isPlus ? 'chart' : 'table');

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
    <Flex
      flexDirection={'column'}
      h={'full'}
      rounded={'lg'}
      bg={'myGray.25'}
      boxShadow={3.5}
      py={[4, 6]}
    >
      <Flex px={[4, 8]}>
        <Flex
          w={'full'}
          gap={2}
          pb={4}
          mb={4}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Flex flex={1}>
            <ProModal
              onClick={() => {
                setViewMode('chart');
              }}
              isPlus={feConfigs.isPlus}
              px={2}
              py={2}
              cursor={'pointer'}
              gap={2}
              borderRadius={'8px'}
              fontWeight={'medium'}
              color={viewMode === 'chart' ? 'primary.600' : 'myGray.500'}
              bg={viewMode === 'chart' ? 'myGray.05' : 'transparent'}
              _hover={{ bg: 'myGray.05' }}
              alignItems={'center'}
            >
              <MyIcon name={'chart'} w={4} />
              {t('app:logs_app_data')}
            </ProModal>
            <Flex
              px={2}
              py={2}
              cursor={'pointer'}
              color={viewMode === 'table' ? 'primary.600' : 'myGray.500'}
              onClick={() => setViewMode('table')}
              gap={2}
              borderRadius={'8px'}
              fontWeight={'medium'}
              bg={viewMode === 'table' ? 'myGray.05' : 'transparent'}
              _hover={{ bg: 'myGray.05' }}
            >
              <MyIcon name={'core/app/logsLight'} w={4} />
              {t('app:log_chat_logs')}
            </Flex>
          </Flex>
          {viewMode === 'chart' && !feConfigs.isPlus && (
            <Flex alignItems={'center'}>
              <ProModal showClose alignItems={'center'} cursor={'pointer'} gap={1.5}>
                <Box color={'primary.600'} fontSize="14px" fontWeight={'medium'}>
                  {t('common:upgrade')}
                </Box>
              </ProModal>
            </Flex>
          )}
        </Flex>
      </Flex>
      {viewMode === 'table' ? (
        <LogTable
          chatSources={chatSources}
          setChatSources={setChatSources}
          isSelectAllSource={isSelectAllSource}
          setIsSelectAllSource={setIsSelectAllSource}
          dateRange={dateRange}
          setDateRange={setDateRange}
        />
      ) : (
        <LogChart
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
