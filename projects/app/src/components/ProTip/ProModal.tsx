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
        py={8}
        _before={{
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          w: '100%',
          h: '100%',
          bgImage: 'url(/imgs/proModalBg.png)',
          bgSize: 'cover',
          bgPosition: 'center',
          bgRepeat: 'no-repeat',
          opacity: 0.48,
          zIndex: -10
        }}
        display={'flex'}
        justifyContent={'center'}
      >
        <VStack gap={4} w={'300px'} px={1}>
          <MyIcon name={'star'} w={8} />
          <Box
            color={'myGray.900'}
            fontSize="20px"
            fontWeight={'medium'}
            lineHeight="26px"
            letterSpacing="0.15px"
          >
            {t('app:pro_modal_title')}
          </Box>
          <Box
            color={'myGray.900'}
            fontSize="18px"
            fontWeight={'medium'}
            lineHeight="26px"
            letterSpacing="0.15px"
          >
            {t('app:pro_modal_subtitle')}
          </Box>
          <Flex
            flexDirection={'column'}
            gap={'10px'}
            w={'full'}
            color={'myGray.900'}
            fontSize={'14px'}
          >
            <Box>{t('app:pro_modal_feature_1')}</Box>
            <Box>{t('app:pro_modal_feature_2')}</Box>
            <Box>{t('app:pro_modal_feature_3')}</Box>
            <Box>
              <MyIcon name={'common/ellipsis'} w={'18px'} />
            </Box>
          </Flex>
          <Flex gap={'3'} flexDirection={'column'} w={'full'}>
            <Button
              w={'full'}
              onClick={() => {
                window.open(getDocPath('/docs/introduction/commercial'), '_blank');
              }}
              fontSize={'14px'}
            >
              {t('app:pro_modal_unlock_button')}
            </Button>
          </Flex>
          <Flex
            rounded={'md'}
            fontSize={'12px'}
            color={'myGray.600'}
            cursor={'pointer'}
            onClick={onClose}
          >
            {t('app:pro_modal_later_button')}
          </Flex>
        </VStack>
      </ModalBody>
    </MyModal>
  );
};

export default ProModal;
