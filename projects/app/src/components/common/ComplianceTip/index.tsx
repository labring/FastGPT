import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, BoxProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';

const ChatTip = ({ type, ...props }: { type: 'chat' | 'dataset' } & BoxProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const textMap = useMemo(() => {
    return {
      chat: t('common:compliance.chat'),
      dataset: t('common:compliance.dataset')
    };
  }, [t]);

  return feConfigs.show_compliance_copywriting ? (
    <Box
      w={'100%'}
      textAlign={'center'}
      fontSize={'0.6875rem'}
      fontWeight={'400'}
      pt={3}
      pb={[3, 0]}
      color={'myGray.400'}
      {...props}
    >
      {textMap[type]}
    </Box>
  ) : null;
};

export default ChatTip;
