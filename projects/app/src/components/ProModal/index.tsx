import { useTranslation } from 'next-i18next';
import type { FlexProps } from '@chakra-ui/react';
import { ModalBody, Flex, useDisclosure, Box, VStack, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getDocPath } from '@/web/common/system/doc';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { useLocalStorageState } from 'ahooks';
import { useMemo } from 'react';

const ProModal = ({
  children,
  onClick,

  isPlus,
  showCloseIcon = false,
  canOpen = true,
  ...props
}: {
  children: React.ReactNode;
  onClick?: () => void;
  isPlus?: boolean;
  showCloseIcon?: boolean;
  canOpen?: boolean;
} & FlexProps) => {
  const { t, i18n } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [lastCloseTime, setLastCloseTime] = useLocalStorageState<number | null>(
    'proModalLastCloseTime',
    {
      defaultValue: null
    }
  );

  const shouldShowProTag = useMemo(() => {
    if (!lastCloseTime) return true;
    const sixHoursInMs = 6 * 60 * 60 * 1000;
    return Date.now() - lastCloseTime > sixHoursInMs;
  }, [lastCloseTime]);

  if (!shouldShowProTag && showCloseIcon) return null;

  return (
    <>
      <Flex
        onClick={() => {
          onClick && onClick();
          !isPlus && canOpen && onOpen();
        }}
        position={'relative'}
        {...props}
      >
        {children}
        {!isPlus && (
          <>
            <MyImage src={i18n.language === 'zh-CN' ? '/imgs/proTag.svg' : '/imgs/proTagEng.svg'} />
            {showCloseIcon && (
              <Box
                position={'absolute'}
                top={'-10px'}
                right={'-10px'}
                cursor={'pointer'}
                _hover={{ bg: 'myGray.05' }}
                h={'12px'}
                rounded={'xs'}
                onClick={(e) => {
                  e.stopPropagation();
                  setLastCloseTime(Date.now());
                }}
              >
                <MyIcon name={'close'} h={'12px'} />
              </Box>
            )}
          </>
        )}
      </Flex>

      <MyModal isOpen={isOpen} onClose={onClose} showCloseButton={false} w={'400px'} h={'392px'}>
        <ModalBody
          position="relative"
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
    </>
  );
};

export default ProModal;
