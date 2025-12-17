/**
 * @file 对话日志主组件
 * @description 智能客服应用的对话日志管理页面，包含日志列表和优化记录两个子Tab
 */
import React, { useState, useCallback } from 'react';
import { Flex, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import LogList from './LogList';
import OptimizeRecords from './OptimizeRecords';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';

type SubTabType = 'list' | 'optimize';

const ConversationLogs = () => {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<SubTabType>('list');
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date()
  });

  // 处理日期范围确认
  const handleDateRangeConfirm = useCallback((newDateRange: DateRangeType) => {
    setDateRange(newDateRange);
  }, []);

  const SubTabHeader = () => (
    <Flex px={[4, 8]} gap={2} py={4} alignItems={'center'} justifyContent={'space-between'}>
      <Flex gap={2}>
        <Flex
          px={2}
          py={2}
          cursor={'pointer'}
          color={subTab === 'list' ? 'primary.600' : 'myGray.500'}
          onClick={() => setSubTab('list')}
          borderRadius={'8px'}
          bg={subTab === 'list' ? 'myGray.05' : 'transparent'}
          _hover={{ bg: 'myGray.05' }}
        >
          {t('app:log_detail')}
        </Flex>
        <Flex
          px={2}
          py={2}
          cursor={'pointer'}
          color={subTab === 'optimize' ? 'primary.600' : 'myGray.500'}
          onClick={() => setSubTab('optimize')}
          borderRadius={'8px'}
          bg={subTab === 'optimize' ? 'myGray.05' : 'transparent'}
          _hover={{ bg: 'myGray.05' }}
        >
          {t('app:optimize_records')}
        </Flex>
      </Flex>
      {subTab === 'optimize' && (
        <DateRangePicker
          dateRange={dateRange}
          onSuccess={handleDateRangeConfirm}
          bg={'myGray.25'}
          h={10}
          flex={'0 1 300px'}
          rounded={'8px'}
          borderColor={'myGray.200'}
          _hover={{
            borderColor: 'primary.300'
          }}
        />
      )}
    </Flex>
  );

  return (
    <Flex flexDirection={'column'} h={'full'} rounded={'lg'} bg={'white'} boxShadow={3.5}>
      <Box bg={'myGray.25'} roundedTop={'lg'}>
        <SubTabHeader />
      </Box>
      <Box flex={'1 0 0'} h={0} my={4} bg={'white'} roundedBottom={'lg'}>
        {subTab === 'list' && <LogList />}
        {subTab === 'optimize' && <OptimizeRecords dateRange={dateRange} />}
      </Box>
    </Flex>
  );
};

export default React.memo(ConversationLogs);
