import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { Box, Button, Flex, HStack, IconButton } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamPlanStatus } from '@/web/support/user/team/api';

import StandardPlan, { BillingModeSwitch } from '@/pageComponents/price/Standard';
import ExtraPlan from '@/pageComponents/price/ExtraPlan';
import PointsCard from '@/pageComponents/price/Points';
import FAQ from '@/pageComponents/price/FAQ';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import PricePlanTabs from '@/pageComponents/price/PricePlanTabs';
import { SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';

type PriceTabType = 'standard' | 'extra';

const EXTRA_PLAN_HASH = 'extra-plan';

/** 根据 URL hash 解析默认 Tab（如账户页「购买额外套餐」跳转 /price#extra-plan） */
const getTabFromHash = (hash: string): PriceTabType | undefined => {
  if (hash === EXTRA_PLAN_HASH) {
    return 'extra';
  }
  return undefined;
};

const PriceBox = () => {
  const { initUserInfo } = useUserStore();
  const { t } = useTranslation(['common', 'user']);
  const { subPlans } = useSystemStore();
  const router = useRouter();

  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [isButtonInView, setIsButtonInView] = useState(true);
  const [userActiveTab, setUserActiveTab] = useState<PriceTabType>(() => {
    if (typeof window === 'undefined') return 'standard';
    return getTabFromHash(window.location.hash.slice(1)) ?? 'standard';
  });
  const [userSubMode, setUserSubMode] = useState<`${SubModeEnum}`>(SubModeEnum.month);

  const { data: userInfo, loading: userInfoLoading } = useRequest(initUserInfo, {
    manual: false
  });

  const { data: teamSubPlan, loading: teamSubPlanLoading } = useRequest(getTeamPlanStatus, {
    manual: false,
    refreshDeps: [userInfo]
  });

  const hashTab = useMemo(() => {
    if (!router.isReady) return undefined;
    return getTabFromHash(router.asPath.split('#')[1] ?? '');
  }, [router.isReady, router.asPath]);

  const activeTab = hashTab ?? userActiveTab;
  const selectSubMode = subPlans?.activityExpirationTime ? SubModeEnum.year : userSubMode;

  const handleTabChange = useCallback(
    (value: PriceTabType) => {
      setUserActiveTab(value);
      if (router.asPath.includes('#')) {
        void router.replace('/price', undefined, { shallow: true });
      }
    },
    [router]
  );

  // TODO: 封装成一个 hook 来判断滚动态
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsButtonInView(entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    const element = backButtonRef.current;
    if (element) {
      observer.observe(element);
    }

    return () => {
      if (element) {
        observer.unobserve(element);
      }
      observer.disconnect();
    };
  });

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard/agent');
    }
  }, [router]);

  const onPaySuccess = useCallback(() => {
    setTimeout(() => {
      router.reload();
    }, 1000);
  }, [router]);

  const isWecomTeam = useMemo(() => !!userInfo?.team?.isWecomTeam, [userInfo?.team?.isWecomTeam]);
  const isLoading = userInfoLoading || teamSubPlanLoading;

  const tabList = useMemo(
    () => [
      {
        label: t('common:support.wallet.subscription.Basic plan tab'),
        value: 'standard' as const
      },
      {
        label: t('common:support.wallet.subscription.Extra points and dataset tab'),
        value: 'extra' as const
      }
    ],
    [t]
  );

  return (
    <>
      {isLoading ? (
        <MyLoading />
      ) : (
        <Flex
          h={'100%'}
          flexDir={'column'}
          overflow={'overlay'}
          w={'100%'}
          bg={`linear-gradient(to right, #F8F8FD00, #F7F7FF),url(/imgs/priceBg.svg)`}
          backgroundSize={'cover'}
          backgroundRepeat={'no-repeat'}
        >
          <Flex
            flexDir={'column'}
            alignItems={'flex-start'}
            flexShrink={0}
            w={'100%'}
            maxW={'1456px'}
            mx={'auto'}
            px={['20px', '72px']}
            py={['30px', '80px']}
          >
            {teamSubPlan?.standard?.teamId && (
              <Button
                ref={backButtonRef}
                variant={'transparentBase'}
                color={'primary.700'}
                leftIcon={<MyIcon name={'core/workflow/undo'} w={4} />}
                onClick={handleBack}
                alignSelf={'flex-start'}
                mb={6}
              >
                {t('common:back')}
              </Button>
            )}
            {(!isButtonInView || !teamSubPlan?.standard?.teamId) && (
              <IconButton
                aria-label={t('common:back')}
                position={'fixed'}
                variant={'whiteBase'}
                top={10}
                left={'1.5vw'}
                w={9}
                h={9}
                icon={<MyIcon name={'core/workflow/undo'} w={4} />}
                onClick={handleBack}
              />
            )}

            <Flex flexDir={'column'} alignItems={'center'} w={'100%'}>
              <Box fontWeight={'600'} color={'myGray.900'} fontSize={['24px', '36px']}>
                {t('common:support.wallet.subscription.Purchase plan')}
              </Box>

              <Box mt={'32px'}>
                <PricePlanTabs
                  list={tabList}
                  value={activeTab}
                  onChange={(value) => handleTabChange(value as PriceTabType)}
                />
              </Box>

              {activeTab === 'standard' && !isWecomTeam && (
                <Box mt={'16px'}>
                  <BillingModeSwitch value={selectSubMode} onChange={setUserSubMode} />
                </Box>
              )}

              {activeTab !== 'standard' && (
                <Box
                  id={'extra-plan'}
                  mt={'16px'}
                  color={'#485264'}
                  fontFamily={'Inter, sans-serif'}
                  fontSize={'16px'}
                  fontStyle={'normal'}
                  fontWeight={400}
                  lineHeight={'24px'}
                  textAlign={'center'}
                >
                  {t('common:support.wallet.subscription.Extra plan tip')}
                </Box>
              )}
            </Flex>

            {activeTab === 'standard' && (
              <Box w={'100%'} mt={'48px'}>
                <StandardPlan
                  standardPlan={teamSubPlan?.standard}
                  onPaySuccess={onPaySuccess}
                  selectSubMode={selectSubMode}
                  onSelectSubModeChange={setUserSubMode}
                  hideBillingToggle
                />
                <HStack mt={8} color={'blue.700'} justifyContent={'center'} w={'100%'}>
                  <MyIcon name={'infoRounded'} w={'1rem'} />
                  <Box fontSize={'sm'} fontWeight={'500'}>
                    {t('user:bill.standard_valid_tip')}
                  </Box>
                </HStack>
              </Box>
            )}

            {activeTab !== 'standard' && (
              <Box w={'100%'} mt={'48px'}>
                <ExtraPlan onPaySuccess={onPaySuccess} />
              </Box>
            )}
          </Flex>

          {/* AI 积分计算标准、FAQ：保持原页面布局，不受 tab 区域 maxW / padding 影响 */}
          <Box w={'100%'} px={['20px', '5vw']} pb={['30px', '80px']}>
            <PointsCard />
            <FAQ />
          </Box>
        </Flex>
      )}
    </>
  );
};

export default PriceBox;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context, ['user'])) }
  };
}
