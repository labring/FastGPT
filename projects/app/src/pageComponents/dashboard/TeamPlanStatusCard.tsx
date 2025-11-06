import { getOperationalAd } from '@/web/common/system/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  StandardSubLevelEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useLocalStorageState } from 'ahooks';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Progress } from '@chakra-ui/react';
import { useRouter } from 'next/router';

const TeamPlanStatusCard = () => {
  const { t } = useTranslation();
  const { teamPlanStatus } = useUserStore();
  const router = useRouter();
  if (!teamPlanStatus?.standardConstants) return null;

  const { data: operationalAd } = useRequest2(() => getOperationalAd(), {
    manual: false
  });

  const [hiddenUntil, setHiddenUntil] = useLocalStorageState<number | undefined>('hidden-until', {
    defaultValue: undefined
  });

  const planName = useMemo(() => {
    if (!teamPlanStatus.standard?.currentSubLevel) return '';
    return standardSubLevelMap[teamPlanStatus.standard?.currentSubLevel].label;
  }, [teamPlanStatus.standard?.currentSubLevel]);

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
      rate:
        ((teamPlanStatus.totalPoints - teamPlanStatus.usedPoints) / teamPlanStatus.totalPoints) *
        100
    };
  }, [t, teamPlanStatus]);

  const valueColorSchema = useCallback((val: number) => {
    if (val < 50) return 'red';
    if (val < 80) return 'yellow';
    return 'green';
  }, []);

  const shouldHide = useMemo(() => {
    if (!hiddenUntil) return false;
    return Date.now() < hiddenUntil;
  }, [hiddenUntil]);

  const handleClose = useCallback(() => {
    const hideUntilTime = Date.now() + 24 * 60 * 60 * 1000;
    setHiddenUntil(hideUntilTime);
  }, [setHiddenUntil]);

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
            as="img"
            rounded={'sm'}
            src={operationalAd.operationalAdImage}
            alt="operational advertisement"
            width="100%"
            objectFit="cover"
            cursor={'pointer'}
            onClick={() => {
              if (operationalAd?.operationalAdLink) {
                window.open(operationalAd.operationalAdLink, '_blank');
              }
            }}
          />
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
        <Flex color={'myGray.500'}>
          <Box>{t('app:remaining_points')}</Box>
          <Flex gap={0.5}>
            <Box color={`${valueColorSchema(aiPointsUsageMap.rate)}.400`}>
              {aiPointsUsageMap.value}
            </Box>
            /<Box>{aiPointsUsageMap.max}</Box>
          </Flex>
        </Flex>
        <Progress
          size={'sm'}
          value={aiPointsUsageMap.rate}
          colorScheme={valueColorSchema(aiPointsUsageMap.rate)}
          borderRadius={'md'}
          isAnimated
          hasStripe
          borderWidth={'1px'}
          borderColor={'borderColor.low'}
        />
        <Flex>
          <Box color={'myGray.500'}> {t('user:current_package')}</Box>
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
