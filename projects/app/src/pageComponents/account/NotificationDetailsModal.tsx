import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import Markdown from '@/components/Markdown';
import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

const NotificationDetailsModal = ({ inform, onClose }: { inform: any; onClose: () => void }) => {
  const { t } = useTranslation();
  const textStyles = {
    title: {
      color: 'grayModern.900',
      fontSize: '20px',
      fontWeight: 'medium',
      lineHeight: 6,
      letterSpacing: '0.15px'
    },
    time: {
      color: 'grayModern.500',
      fontSize: '12px',
      lineHeight: 5,
      letterSpacing: '0.25px'
    }
  };
  return (
    <MyModal
      isOpen={!!inform}
      iconSrc={'support/user/informLight'}
      title={t('account_inform:notification_detail')}
      onClose={onClose}
      iconColor="blue.600"
      maxW="680px"
      maxH="80vh"
    >
      <Flex flexDirection="column" p={8}>
        <Flex
          {...textStyles.time}
          fontFamily="PingFang SC"
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          alignSelf="stretch"
        >
          <Box {...textStyles.title} fontFamily="PingFang SC">
            {inform.title}
          </Box>
          <Box {...textStyles.time} ml={3} flex={1} fontFamily="PingFang SC">
            {t(formatTimeToChatTime(inform.time) as any).replace('#', ':')}
          </Box>
          <MyTag
            colorSchema={inform.teamId ? 'green' : 'blue'}
            mr={2}
            fontSize="xs"
            fontWeight="medium"
            showDot={false}
            type="fill"
          >
            {inform.teamId ? t('account_inform:team') : t('account_inform:system')}
          </MyTag>
        </Flex>
        <MyDivider my={4} />

        <Box fontSize="sm" lineHeight={1.8}>
          <Markdown source={inform?.content} />
        </Box>
      </Flex>
    </MyModal>
  );
};

export default React.memo(NotificationDetailsModal);
