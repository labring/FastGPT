/**
 * @file 对话日志主组件
 * @description 智能客服应用的对话日志管理页面，包含日志列表和优化记录两个子Tab
 */
import React, { useState } from 'react';
import { Flex, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import LogList from './LogList';
import OptimizeRecords from './OptimizeRecords';

type SubTabType = 'list' | 'optimize';

const ConversationLogs = () => {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<SubTabType>('list');

  const SubTabHeader = () => (
    <Flex
      px={[4, 8]}
      gap={2}
      pb={4}
      mb={4}
      borderBottom={'1px solid'}
      borderColor={'myGray.200'}
      alignItems={'center'}
    >
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
        {t('app:logs_keys_optimizedCount')}
      </Flex>
    </Flex>
  );

  return (
    <Flex
      flexDirection={'column'}
      h={'full'}
      rounded={'lg'}
      bg={'myGray.25'}
      boxShadow={3.5}
      py={[4, 6]}
    >
      <SubTabHeader />
      <Box flex={'1 0 0'} h={0}>
        {subTab === 'list' && <LogList />}
        {subTab === 'optimize' && <OptimizeRecords />}
      </Box>
    </Flex>
  );
};

export default React.memo(ConversationLogs);
