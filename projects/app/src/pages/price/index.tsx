import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, HStack, IconButton } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamPlanStatus } from '@/web/support/user/team/api';

import StandardPlan, { BillingModeSwitch } from '@/pageComponents/price/Standard';
import ExtraPlan from '@/pageComponents/price/ExtraPlan';
import PointsCard from '@/pageComponents/price/Points';
import FAQ from '@/pageComponents/price/FAQ';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import PricePlanTabs from '@/pageComponents/price/PricePlanTabs';
import { SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { isPriceTabType, type PriceTabType } from '@/web/support/wallet/sub/constants';
import { getAuthLoginRedirectPath } from '@/web/support/user/loginRedirect/url';
import {
  consumePricePurchaseIntent,
  savePricePurchaseIntent,
  type PricePurchaseIntent
} from '@/pageComponents/price/purchaseIntent';

const PriceBox = () => {
  const { initUserInfo } = useUserStore();
  const { t } = useClientTranslation('price');
  const { subPlans } = useSystemStore();
  const router = useRouter();

  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [isButtonInView, setIsButtonInView] = useState(true);
  const [userActiveTab, setUserActiveTab] = useState<PriceTabType>(() => {
    if (typeof window === 'undefined') return 'standard';
    const hash = window.location.hash.slice(1);
    return isPriceTabType(hash) ? hash : 'standard';
  });
  const [userSubMode, setUserSubMode] = useState<`${SubModeEnum}`>(SubModeEnum.month);
  const [resumePurchaseIntent, setResumePurchaseIntent] = useState<PricePurchaseIntent>();

  const { data: initialData, loading: isLoading } = useRequest(
    async () => {
      // 团队上下文由用户初始化写入，请求套餐前必须等待它完成，避免重复请求造成页面二次白屏。
      const userInfo = await initUserInfo();
      const teamSubPlan = await getTeamPlanStatus();

      return { userInfo, teamSubPlan };
    },
    {
      manual: false
    }
  );
  const userInfo = initialData?.userInfo;
  const teamSubPlan = initialData?.teamSubPlan;
  const shouldResumePurchase = router.query.resumePurchase === '1';

  const handleLoginRequired = useCallback(
    (intent: PricePurchaseIntent) => {
      savePricePurchaseIntent(intent);
      const tab = intent.type === 'standard' ? 'standard' : 'extra';
      void router.push(getAuthLoginRedirectPath({ lastRoute: `/price?resumePurchase=1#${tab}` }));
    },
    [router]
  );

  const handleResumePurchaseIntent = useCallback(() => {
    setResumePurchaseIntent(undefined);
  }, []);

  useEffect(() => {
    if (isLoading || !router.isReady || !shouldResumePurchase) return;

    const intent = consumePricePurchaseIntent();
    const tab = intent?.type === 'standard' ? 'standard' : 'extra';
    void router.replace(`/price#${tab}`, undefined, { shallow: true });

    if (!userInfo || !intent) return;
    queueMicrotask(() => {
      if (intent.type === 'standard') {
        setUserSubMode(intent.subMode);
      }
      setResumePurchaseIntent(intent);
    });
  }, [isLoading, router, shouldResumePurchase, userInfo]);

  const hashTab = useMemo(() => {
    if (!router.isReady) return undefined;
    const hash = router.asPath.split('#')[1] ?? '';
    return isPriceTabType(hash) ? hash : undefined;
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

  const tabList = useMemo<Array<{ label: string; value: PriceTabType }>>(
    () => [
      {
        label: t('price:support.wallet.subscription.Basic plan tab'),
        value: 'standard'
      },
      {
        label: t('price:support.wallet.subscription.Extra points and dataset tab'),
        value: 'extra'
      }
    ],
    [t]
  );

  return (
    <>
      {!isLoading && (
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
                {t('price:support.wallet.subscription.Purchase plan')}
              </Box>

              <Box mt={'32px'}>
                <PricePlanTabs list={tabList} value={activeTab} onChange={handleTabChange} />
              </Box>

              {activeTab === 'standard' && (
                <Box mt={'16px'}>
                  <BillingModeSwitch value={selectSubMode} onChange={setUserSubMode} />
                </Box>
              )}

              {activeTab !== 'standard' && (
                <Box
                  id={'extra'}
                  mt={'16px'}
                  color={'#485264'}
                  fontFamily={'Inter, sans-serif'}
                  fontSize={'16px'}
                  fontStyle={'normal'}
                  fontWeight={400}
                  lineHeight={'24px'}
                  textAlign={'center'}
                >
                  {t('price:support.wallet.subscription.Extra plan tip')}
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
                  onLoginRequired={handleLoginRequired}
                  resumePurchaseIntent={resumePurchaseIntent}
                  onResumePurchaseIntentHandled={handleResumePurchaseIntent}
                  hideBillingToggle
                />
                <HStack mt={8} color={'blue.700'} justifyContent={'center'} w={'100%'}>
                  <MyIcon name={'infoRounded'} w={'1rem'} />
                  <Box fontSize={'sm'} fontWeight={'500'}>
                    {t('price:bill.standard_valid_tip')}
                  </Box>
                </HStack>
              </Box>
            )}

            {activeTab !== 'standard' && (
              <Box w={'100%'} mt={'48px'}>
                <ExtraPlan
                  onPaySuccess={onPaySuccess}
                  onLoginRequired={handleLoginRequired}
                  resumePurchaseIntent={resumePurchaseIntent}
                  onResumePurchaseIntentHandled={handleResumePurchaseIntent}
                />
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
