import { Box, Button, Flex, VStack } from '@chakra-ui/react';
import HighlightModal from '@fastgpt/web/components/v2/common/MyModal/HighlightModal';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

type ProModalProps = {
  isOpen?: boolean;
  onClose?: () => void;
  forceShow?: boolean;
};

const ProModal = (props: ProModalProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [isOpen, setIsOpen] = useState(false);

  const openModal = props?.isOpen ?? isOpen;
  const onClose = props?.onClose ?? (() => setIsOpen(false));
  const { forceShow = false } = props;

  const onPrimaryClick = () => {
    window.open(getDocPath('/guide/version/commercial'), '_blank');
  };

  return feConfigs?.isPlus && !forceShow ? null : (
    <HighlightModal
      isOpen={openModal}
      onClose={onClose}
      title={t('common:pro_modal_title')}
      footer={
        <Flex gap={3} flexDirection={'column'} w={'full'}>
          <Button
            w={'full'}
            h={'48px'}
            borderRadius={'10px'}
            onClick={onPrimaryClick}
            fontSize={'16px'}
            fontWeight={'medium'}
          >
            {t('common:pro_modal_unlock_button')}
          </Button>
          <Button
            w={'full'}
            h={'48px'}
            borderRadius={'10px'}
            variant={'whiteBase'}
            fontSize={'16px'}
            fontWeight={'medium'}
            borderColor={'#E4E7ED'}
            boxShadow={'0 2px 5px rgba(15, 23, 42, 0.06)'}
            onClick={onClose}
          >
            {t('common:pro_modal_later_button')}
          </Button>
        </Flex>
      }
    >
      <VStack
        w={'full'}
        color={'myGray.900'}
        fontSize={'18px'}
        alignItems={'center'}
        gap={0}
        mt={7}
      >
        <Box lineHeight={'26px'}>{t('common:pro_modal_subtitle')}</Box>
        <Box lineHeight={'26px'}>{t('common:pro_modal_feature_1')}</Box>
        <Box lineHeight={'26px'}>{t('common:pro_modal_feature_2')}</Box>
        <Box lineHeight={'26px'}>{t('common:pro_modal_feature_3')}</Box>
        <Box color={'myGray.500'} letterSpacing={'2px'} lineHeight={'26px'}>
          ......
        </Box>
      </VStack>
    </HighlightModal>
  );
};

export default ProModal;
