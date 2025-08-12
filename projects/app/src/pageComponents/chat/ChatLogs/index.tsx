import NextHead from '@/components/common/NextHead';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import { Box, Flex } from '@chakra-ui/react';
import { useState } from 'react';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { useMultipleSelect } from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useContextSelector } from 'use-context-selector';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ProTag from '@/components/ProTip/Tag';
import ProText from '@/components/ProTip/ProText';
import LogTable from './LogTable';
import LogChart from './LogChart';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

const ChatLogs = ({ Header }: Props) => {
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

  const chatSettings = useContextSelector(ChatSettingContext, (v) => v.chatSettings);

  return (
    <Flex
      py={5}
      px={6}
      gap={['26px', '26px']}
      flexDir="column"
      mt={['46px', 0]}
      h={['calc(100vh - 46px)', 'full']}
    >
      <NextHead title={chatSettings?.homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

      <Header />

      <Flex flexDirection={'column'} h={'full'}>
        <Flex>
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
    </Flex>
  );
};

export default ChatLogs;
