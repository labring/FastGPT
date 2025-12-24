import React, { useCallback, useMemo } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { getActivityAd } from '@/web/common/system/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  Box,
  Flex,
  Button,
  Image,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useLocalStorageState } from 'ahooks';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';

const CLOSED_AD_KEY = 'logout-activity-ad';
const CLOSED_AD_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const ActivityAdModal = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();
  const { userInfo } = useUserStore();

  // Check if ad was recently closed
  const [closedData, setClosedData] = useLocalStorageState<string>(CLOSED_AD_KEY, {
    listenStorageChange: true
  });

  const { data } = useRequest2(
    async () => {
      if (!feConfigs?.isPlus || !userInfo) return;
      return getActivityAd();
    },
    {
      manual: false,
      onSuccess(res) {
        const shouldShowAd = (() => {
          if (!res?.id) return false;
          if (!closedData) return true;

          try {
            const { timestamp, adId } = JSON.parse(closedData) as {
              timestamp: number;
              adId: string;
            };
            // 不同的广告 id，一定展示
            if (adId && res.id !== adId) return true;
            const now = Date.now();
            // Show if 24 hours passed
            return now - timestamp > CLOSED_AD_DURATION;
          } catch {
            return true;
          }
        })();

        if (res?.activityAdImage && shouldShowAd) {
          onOpen();
        }
      },
      refreshDeps: [userInfo]
    }
  );

  const handleClose = useCallback(() => {
    if (data?.id) {
      setClosedData(JSON.stringify({ timestamp: Date.now(), adId: data.id }));
    }
    onClose();
  }, [data?.id, onClose, setClosedData]);

  const handleJoin = useCallback(() => {
    if (data?.activityAdLink) {
      if (data.activityAdLink.startsWith('/')) {
        router.push(data.activityAdLink);
        handleClose();
      } else {
        window.open(data.activityAdLink, '_blank');
      }
    }
  }, [data?.activityAdLink, handleClose, router]);

  if (!data?.activityAdImage || !userInfo) {
    return null;
  }

  return isOpen ? (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      isCentered
      size="xl"
      closeOnOverlayClick={false}
      blockScrollOnMount
    >
      <ModalOverlay bg="blackAlpha.600" />
      <ModalContent
        maxW="400px"
        bg="white"
        borderRadius="10px"
        overflow="hidden"
        position="relative"
        p={0}
      >
        <ModalCloseButton
          position="absolute"
          top={1}
          right={1}
          zIndex={10}
          bg={'rgba(244, 246, 248, 0.40)'}
          borderRadius={'full'}
          boxSize={9}
          display={'flex'}
          alignItems={'center'}
          justifyContent="center"
          color={'white'}
          _hover={{ bg: 'rgba(244, 246, 248, 0.60)' }}
        />

        <Flex direction="column">
          {/* Activity Image */}
          <Box position="relative">
            <Image
              src={data.activityAdImage}
              alt="Activity"
              w="100%"
              h="auto"
              objectFit="cover"
              userSelect="none"
              draggable={false}
            />
            {/* Gradient overlay for smooth transition */}
            <Box
              position="absolute"
              bottom={0}
              left={0}
              right={0}
              h={10}
              bg="linear-gradient(180deg, rgba(255, 255, 255, 0.00) 0%, #FFF 100%)"
              pointerEvents="none"
            />
          </Box>

          <Flex
            mt={6}
            justifyContent={'center'}
            color={'black'}
            fontSize="20px"
            fontWeight={'medium'}
          >
            {t('common:activity_ad.title')}
          </Flex>

          <Flex mt={6} color={'black'} justifyContent={'center'} fontSize={'14px'} px={8}>
            {t('common:activity_ad.desc')}
          </Flex>

          <Flex direction="column" align="center" p={8} bg="white">
            <Flex direction="column" width="100%" gap={3}>
              <Button
                width={'100%'}
                bg={'#ED372C'}
                color={'white'}
                borderRadius={'6px'}
                h={10}
                sx={{
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    width: '30px',
                    height: '30px',
                    backgroundImage: `url('/imgs/system/snowflakeLeft.svg')`,
                    backgroundRepeat: 'no-repeat'
                  },
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    right: '0',
                    bottom: '0',
                    width: '25px',
                    height: '25px',
                    backgroundImage: `url('/imgs/system/snowflakeRight.svg')`
                  }
                }}
                _hover={{ bg: '#DE0D00' }}
                onClick={handleJoin}
              >
                {t('common:activity_ad.join_now')}
              </Button>
              <Button width="100%" variant="whiteBase" h={10} onClick={handleClose}>
                {t('common:activity_ad.later')}
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </ModalContent>
    </Modal>
  ) : null;
};

export default React.memo(ActivityAdModal);
