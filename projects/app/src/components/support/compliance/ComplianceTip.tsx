import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, BoxProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
export enum TipTypeEnum {
  chat = 'chat',
  dataset = 'dataset'
}
const ChatTip = ({ type, ...props }: { type: `${TipTypeEnum}` } & BoxProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const textMap = useMemo(() => {
    return {
      [TipTypeEnum.chat]: t('common:compliance.chat'),
      [TipTypeEnum.dataset]: t('common:compliance.dataset')
    };
  }, [t]);
  return (
    feConfigs.show_compliance_documentation && (
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
    )
  );
};

export default ChatTip;
