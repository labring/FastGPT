import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  StandardSubLevelEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { useLocalStorageState } from 'ahooks';
import { useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { webPushTrack } from '@/web/common/middle/tracks/utils';

const TeamPlanStatusCard = () => {
  const { t } = useTranslation();
  const { teamPlanStatus } = useUserStore();
  const { operationalAd, loadOperationalAd, feConfigs, subPlans } = useSystemStore();
  const router = useRouter();

  // Load data
  useEffect(() => {
    if (!operationalAd && feConfigs?.isPlus) {
      loadOperationalAd();
    }
    if (operationalAd?.id) {
      const currentKey = `logout-operational-${operationalAd.id}`;
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('logout-operational-') && key !== currentKey) {
          localStorage.removeItem(key);
        }
      });
    }
  }, [operationalAd, loadOperationalAd]);

  const [hiddenUntil, setHiddenUntil] = useLocalStorageState<number | undefined>(
    `logout-operational-${operationalAd?.id}`,
    {
      defaultValue: undefined
    }
  );

  const planName = useMemo(() => {
    if (!teamPlanStatus?.standard?.currentSubLevel) return '';
    return (
      subPlans?.standard?.[teamPlanStatus.standard.currentSubLevel]?.name ||
      standardSubLevelMap[teamPlanStatus.standard.currentSubLevel]?.label
    );
  }, [teamPlanStatus?.standard?.currentSubLevel, subPlans]);

  const aiPointsUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        value: 0,
        max: t('account_info:unlimited'),
        rate: 0
      };
    }

    return {
      value: Math.round(teamPlanStatus.usedPoints),
      max: teamPlanStatus.totalPoints,
      rate: (teamPlanStatus.usedPoints / teamPlanStatus.totalPoints) * 100
    };
  }, [t, teamPlanStatus]);

  const valueColorSchema = useCallback((val: number) => {
    if (val < 50) return 'primary';
    if (val < 80) return 'yellow';
    return 'red';
  }, []);

  const shouldHide = useMemo(() => {
    if (!hiddenUntil) return false;
    return Date.now() < hiddenUntil;
  }, [hiddenUntil]);

  const handleClose = useCallback(() => {
    if (operationalAd?.id) {
      webPushTrack.closeOperationalAd({
        adId: operationalAd.id
      });
    }

    const hideUntilTime = Date.now() + 24 * 60 * 60 * 1000;
    setHiddenUntil(hideUntilTime);
  }, [setHiddenUntil, operationalAd]);

  if (!teamPlanStatus?.standardConstants) return null;

  return (
    <Box
      p={2}
      borderRadius={'md'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      fontSize={'xs'}
      fontWeight={'medium'}
    >
      {!shouldHide && operationalAd?.operationalAdImage && (
        <Flex mb={2} position={'relative'}>
          <Box
            position="relative"
            width="100%"
            aspectRatio="2 / 1"
            overflow="hidden"
            rounded="sm"
            cursor="pointer"
            onClick={() => {
              if (operationalAd?.operationalAdLink) {
                webPushTrack.clickOperationalAd({
                  adId: operationalAd.id,
                  adLink: operationalAd.operationalAdLink
                });
                window.open(operationalAd.operationalAdLink, '_blank');
              }
            }}
          >
            <Box
              as="img"
              src={operationalAd.operationalAdImage}
              alt="operational advertisement"
              width="100%"
              height="100%"
              objectFit="cover"
              style={{
                display: 'block',
                width: '100%',
                height: '100%'
              }}
            />
          </Box>
          <Box
            bg={'rgba(23, 23, 23, 0.05)'}
            rounded={'full'}
            position={'absolute'}
            w={4}
            h={4}
            top={0.5}
            right={0.5}
            display={'flex'}
            justifyContent={'center'}
            alignItems={'center'}
            cursor={'pointer'}
            _hover={{
              bg: 'rgba(23, 23, 23, 0.1)'
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
          >
            <MyIcon name={'common/closeLight'} w={3} />
          </Box>
        </Flex>
      )}

      <Flex flexDirection={'column'} gap={1}>
        <Flex color={'myGray.500'} flexWrap={'wrap'} gap={1}>
          <Box whiteSpace={'noWrap'}>{t('app:used_points')}</Box>
          <Flex gap={'1px'} alignItems={'center'} flexShrink={0}>
            <Box color={`${valueColorSchema(aiPointsUsageMap.rate)}.500`}>
              {aiPointsUsageMap.value}
            </Box>
            /<Box>{aiPointsUsageMap.max}</Box>
          </Flex>
        </Flex>
        <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
          <Box
            borderRadius={'sm'}
            transition="width 0.3s"
            w={`${aiPointsUsageMap.rate}%`}
            bg={`${valueColorSchema(aiPointsUsageMap.rate)}.500`}
          />
        </Flex>
        <Flex>
          <Box color={'myGray.500'}> {t('app:current_package')}</Box>
          <Box
            color={'primary.400'}
            cursor={'pointer'}
            onClick={() => {
              router.push('/price');
            }}
          >
            {t(planName as any)}
          </Box>
        </Flex>
        <Button
          borderRadius={'6px'}
          bg={'linear-gradient(90deg, #64C2DB 0%, #7476ED 29.42%, #C994DF 57.87%, #E56F8C 95.82%)'}
          color={'white'}
          w={'full'}
          leftIcon={<MyIcon name={'common/rocket'} w={4} />}
          onClick={() => {
            router.push('/price');
          }}
        >
          {teamPlanStatus.standard?.currentSubLevel === StandardSubLevelEnum.free
            ? t('app:upgrade')
            : t('app:recharge')}
        </Button>
      </Flex>
    </Box>
  );
};

export default TeamPlanStatusCard;
