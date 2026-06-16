import { ModalBody, Flex, Box, VStack, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

const ProModal = (props: { isOpen?: boolean; onClose?: () => void }) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [isOpen, setIsOpen] = useState(false);

  const openModal = props?.isOpen ?? isOpen;
  const onClose = props?.onClose ?? (() => setIsOpen(false));

  return feConfigs?.isPlus ? null : (
    <MyModal
      isOpen={openModal}
      onClose={onClose}
      showCloseButton={false}
      w={'400px'}
      minH={'392px'}
    >
      <ModalBody
        userSelect={'none'}
        pt={0}
        pb={8}
        px={6}
        position={'relative'}
        overflow={'hidden'}
        _before={{
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          w: '100%',
          h: '100%',
          bgImage: 'url(/imgs/proModalBg.png)',
          bgSize: '100% auto',
          bgPosition: 'top center',
          bgRepeat: 'no-repeat',
          opacity: 0.32,
          zIndex: -10
        }}
        display={'flex'}
        justifyContent={'center'}
      >
        <VStack w={'full'} alignItems={'center'} textAlign={'center'} gap={0}>
          <Flex h={'112px'} alignItems={'center'} justifyContent={'center'}>
            <MyIcon name={'star'} w={9} h={9} transform={'translateY(40%)'} />
          </Flex>
          <Box color={'myGray.900'} fontSize={'26px'} fontWeight={'bold'} lineHeight={'34px'}>
            {t('common:pro_modal_title')}
          </Box>
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
          <Flex gap={3} flexDirection={'column'} w={'full'} mt={6}>
            <Button
              w={'full'}
              h={'48px'}
              borderRadius={'10px'}
              onClick={() => {
                window.open(getDocPath('/guide/version/commercial'), '_blank');
              }}
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
        </VStack>
      </ModalBody>
    </MyModal>
  );
};

export default ProModal;
