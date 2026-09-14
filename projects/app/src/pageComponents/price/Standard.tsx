import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { Trans } from 'next-i18next';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { TeamPlanStandardType } from '@fastgpt/global/support/wallet/sub/type';

import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import { postCreatePayBill } from '@/web/support/wallet/bill/api';
import { getDiscountCouponList } from '@/web/support/wallet/sub/discountCoupon/api';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import {
  DiscountCouponStatusEnum,
  DiscountCouponTypeEnum
} from '@fastgpt/global/support/wallet/sub/discountCoupon/constants';
import { formatActivityExpirationTime } from './utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  getStandardPackageChangeStatus,
  PackageChangeStatusEnum,
  type PricePurchaseIntent
} from './purchaseIntent';

const NEW_PLAN_LEVELS = [
  StandardSubLevelEnum.free,
  StandardSubLevelEnum.basic,
  StandardSubLevelEnum.advanced,
  StandardSubLevelEnum.custom
];
const PLAN_CARD_MIN_WIDTH = 260;
const PLAN_CARD_MAX_WIDTH = 400;
const PLAN_CARD_GAP = 24;

type ResponsivePlanLayout = {
  columnCount: 1 | 2 | 4;
  cardWidth: number;
  gap: number;
};

/** 按月/按年切换开关，可在页面 header 区域复用 */
export const BillingModeSwitch = ({
  value,
  onChange
}: {
  value: `${SubModeEnum}`;
  onChange: (mode: `${SubModeEnum}`) => void;
}) => {
  const { t } = useClientTranslation('price');
  const isYear = value === SubModeEnum.year;

  return (
    <Flex flexDirection={['column', 'row']} alignItems={'center'} gap={[2, 3]}>
      <Flex alignItems={'center'} gap={3} whiteSpace={'nowrap'}>
        <Box
          fontFamily={'Inter'}
          fontSize={'14px'}
          fontStyle={'normal'}
          fontWeight={400}
          lineHeight={'21px'}
          color={'#020617'}
          userSelect={'none'}
        >
          {t('price:support.wallet.subscription.mode.Month pay')}
        </Box>
        <Flex
          role={'switch'}
          aria-checked={isYear}
          tabIndex={0}
          w={'40px'}
          h={'24px'}
          p={'0 4px'}
          alignItems={'center'}
          flexShrink={0}
          borderRadius={'full'}
          bg={'#E8EBF0'}
          cursor={'pointer'}
          justifyContent={isYear ? 'flex-end' : 'flex-start'}
          onClick={() => onChange(isYear ? SubModeEnum.month : SubModeEnum.year)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onChange(isYear ? SubModeEnum.month : SubModeEnum.year);
            }
          }}
        >
          <Box
            w={'16px'}
            h={'16px'}
            borderRadius={'full'}
            bg={'white'}
            boxShadow={'0 1px 2px rgba(19, 51, 107, 0.15)'}
          />
        </Flex>
        <Box
          fontFamily={'Inter'}
          fontSize={'14px'}
          fontStyle={'normal'}
          fontWeight={400}
          lineHeight={'20px'}
          color={'#475569'}
          userSelect={'none'}
        >
          {t('price:support.wallet.subscription.mode.Year pay')}
        </Box>
      </Flex>
      <Box
        as={'span'}
        textAlign={'center'}
        sx={{
          color: '#3B82F6',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          fontStyle: 'normal',
          fontWeight: 400,
          lineHeight: '20px'
        }}
      >
        <Trans
          i18nKey={'price:pay_year_tip'}
          values={{ count: 10 }}
          components={{
            italic: <Box as={'span'} fontStyle={'italic'} />
          }}
        />
      </Box>
    </Flex>
  );
};

const Standard = ({
  standardPlan: myStandardPlan,
  onPaySuccess,
  selectSubMode: controlledSubMode,
  onSelectSubModeChange,
  onLoginRequired,
  resumePurchaseIntent,
  onResumePurchaseIntentHandled,
  hideBillingToggle = false,
  responsiveCardLayout = false
}: {
  standardPlan?: TeamPlanStandardType;
  onPaySuccess?: () => void;
  selectSubMode?: `${SubModeEnum}`;
  onSelectSubModeChange?: (mode: `${SubModeEnum}`) => void;
  onLoginRequired?: (intent: PricePurchaseIntent) => void;
  resumePurchaseIntent?: PricePurchaseIntent;
  onResumePurchaseIntentHandled?: () => void;
  hideBillingToggle?: boolean;
  responsiveCardLayout?: boolean;
}) => {
  const { t, i18n } = useClientTranslation('price');
  const { userInfo } = useUserStore();
  const isChinese = i18n.language.startsWith('zh');

  const packagePayTextMap = {
    [PackageChangeStatusEnum.buy]: t('price:pay.package_tip.buy'),
    [PackageChangeStatusEnum.renewal]: t('price:pay.package_tip.renewal'),
    [PackageChangeStatusEnum.upgrade]: t('price:pay.package_tip.upgrade')
  };

  const [packageChange, setPackageChange] = useState<PackageChangeStatusEnum>();
  const { subPlans, feConfigs } = useSystemStore();
  const [internalSubMode, setInternalSubMode] = useState<`${SubModeEnum}`>(SubModeEnum.month);
  const planContainerRef = useRef<HTMLDivElement>(null);
  const [responsivePlanLayout, setResponsivePlanLayout] = useState<ResponsivePlanLayout>({
    columnCount: 4,
    cardWidth: PLAN_CARD_MIN_WIDTH,
    gap: PLAN_CARD_GAP
  });
  const selectSubMode = controlledSubMode ?? internalSubMode;
  const setSelectSubMode = onSelectSubModeChange ?? setInternalSubMode;
  const hasActivityExpiration =
    !!subPlans?.activityExpirationTime && selectSubMode === SubModeEnum.year;

  useEffect(() => {
    setSelectSubMode(subPlans?.activityExpirationTime ? SubModeEnum.year : SubModeEnum.month);
  }, [setSelectSubMode, subPlans?.activityExpirationTime]);

  useEffect(() => {
    if (!responsiveCardLayout || !planContainerRef.current) return;

    const container = planContainerRef.current;
    const updatePlanLayout = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth <= 0) return;

      const fourColumnMinWidth = PLAN_CARD_MIN_WIDTH * 4 + PLAN_CARD_GAP * 3;
      const twoColumnMinWidth = PLAN_CARD_MIN_WIDTH * 2 + PLAN_CARD_GAP;
      const nextLayout: ResponsivePlanLayout = (() => {
        if (availableWidth >= fourColumnMinWidth) {
          return {
            columnCount: 4,
            cardWidth: Math.min(
              PLAN_CARD_MAX_WIDTH,
              Math.floor((availableWidth - PLAN_CARD_GAP * 3) / 4)
            ),
            gap: PLAN_CARD_GAP
          };
        }
        if (availableWidth >= twoColumnMinWidth) {
          return {
            columnCount: 2,
            cardWidth: Math.min(
              PLAN_CARD_MAX_WIDTH,
              Math.floor((availableWidth - PLAN_CARD_GAP) / 2)
            ),
            gap: PLAN_CARD_GAP
          };
        }
        return {
          columnCount: 1,
          cardWidth: Math.max(PLAN_CARD_MIN_WIDTH, Math.min(PLAN_CARD_MAX_WIDTH, availableWidth)),
          gap: PLAN_CARD_GAP
        };
      })();

      setResponsivePlanLayout((previous) =>
        previous.columnCount === nextLayout.columnCount &&
        previous.cardWidth === nextLayout.cardWidth &&
        previous.gap === nextLayout.gap
          ? previous
          : nextLayout
      );
    };

    updatePlanLayout();
    const resizeObserver = new ResizeObserver(updatePlanLayout);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [responsiveCardLayout]);

  // 获取优惠券
  const {
    data: coupons = [],
    runAsync: getCoupons,
    loading: couponsLoading
  } = useRequest(
    async () => {
      if (!myStandardPlan?.teamId) return [];
      return getDiscountCouponList(myStandardPlan.teamId);
    },
    {
      manual: !myStandardPlan?.teamId,
      refreshDeps: [myStandardPlan?.teamId]
    }
  );
  // 匹配合适的优惠券
  const matchedCoupon = useMemo(() => {
    const targetType =
      selectSubMode === SubModeEnum.month
        ? DiscountCouponTypeEnum.monthStandardDiscount70
        : DiscountCouponTypeEnum.yearStandardDiscount90;

    return coupons.find(
      (coupon) => coupon.type === targetType && coupon.status === DiscountCouponStatusEnum.active
    );
  }, [coupons, selectSubMode]);

  const standardSubList = useMemo(() => {
    return subPlans?.standard
      ? Object.entries(subPlans.standard)
          .filter(([level, value]) => {
            if (!NEW_PLAN_LEVELS.includes(level as StandardSubLevelEnum)) {
              return false;
            }
            if (level === StandardSubLevelEnum.custom && !value.customFormUrl) {
              return false;
            }
            return true;
          })
          .map(([level, value]) => {
            return {
              ...standardSubLevelMap[level as `${StandardSubLevelEnum}`],
              ...(value.desc ? { desc: value.desc } : {}),
              ...(value.name ? { label: value.name } : {}),
              price: value.price * (selectSubMode === SubModeEnum.month ? 1 : 10),
              level: level as `${StandardSubLevelEnum}`,
              maxTeamMember: myStandardPlan?.maxTeamMember ?? value.maxTeamMember,
              maxAppAmount: myStandardPlan?.maxAppAmount ?? value.maxAppAmount,
              maxDatasetAmount: myStandardPlan?.maxDatasetAmount ?? value.maxDatasetAmount,
              chatHistoryStoreDuration: value.chatHistoryStoreDuration,
              maxDatasetSize: value.maxDatasetSize,
              annualBonusPoints: selectSubMode === SubModeEnum.month ? 0 : value.annualBonusPoints,
              totalPoints: value.totalPoints * (selectSubMode === SubModeEnum.month ? 1 : 12),

              // custom plan
              priceDescription: value.priceDescription,
              customDescriptions: value.customDescriptions,
              customFormUrl: value.customFormUrl
            };
          })
      : [];
  }, [
    subPlans,
    selectSubMode,
    myStandardPlan?.maxTeamMember,
    myStandardPlan?.maxAppAmount,
    myStandardPlan?.maxDatasetAmount
  ]);

  // Pay code
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  /* Get pay code */
  const { runAsync: onPay, loading: isLoading } = useRequest(postCreatePayBill, {
    onSuccess(res) {
      // Redirect-based payment opens in a new tab; QR-based payment uses the modal below.
      if (res.payUrl) {
        window.open(res.payUrl, '_blank');
        return;
      }
      // For other payment methods, show QR code modal
      setQRPayData({
        ...res,
        billId: res.billId!
      });
    }
  });

  const submitStandardPurchase = useCallback(
    ({ packageChange, level, subMode }: Extract<PricePurchaseIntent, { type: 'standard' }>) => {
      if (!userInfo && onLoginRequired) {
        onLoginRequired({ type: 'standard', packageChange, level, subMode });
        return;
      }

      setPackageChange(packageChange);
      void onPay({
        type: BillTypeEnum.standSubPlan,
        level: level as StandardSubLevelEnum,
        subMode: subMode as SubModeEnum,
        discountCouponId: matchedCoupon?._id
      });
    },
    [matchedCoupon?._id, onLoginRequired, onPay, userInfo]
  );

  useEffect(() => {
    if (resumePurchaseIntent?.type !== 'standard' || couponsLoading) return;

    queueMicrotask(() => {
      onResumePurchaseIntentHandled?.();
      submitStandardPurchase({
        ...resumePurchaseIntent,
        packageChange: getStandardPackageChangeStatus({
          currentLevel: myStandardPlan?.currentSubLevel,
          targetLevel: resumePurchaseIntent.level
        })
      });
    });
  }, [
    couponsLoading,
    myStandardPlan?.currentSubLevel,
    onResumePurchaseIntentHandled,
    resumePurchaseIntent,
    submitStandardPurchase
  ]);

  // 计算活动时间
  const { text: activityExpirationTime } = formatActivityExpirationTime(
    subPlans?.activityExpirationTime
  );

  return (
    <>
      <Flex
        ref={planContainerRef}
        flexDirection={'column'}
        alignItems={'center'}
        position={'relative'}
        w={'100%'}
      >
        {!hideBillingToggle && (
          <BillingModeSwitch value={selectSubMode} onChange={setSelectSubMode} />
        )}

        <Flex
          mt={hideBillingToggle ? 0 : '24px'}
          display={responsiveCardLayout ? 'grid' : 'flex'}
          gridTemplateColumns={
            responsiveCardLayout
              ? `repeat(${responsivePlanLayout.columnCount}, minmax(0, ${responsivePlanLayout.cardWidth}px))`
              : undefined
          }
          gap={responsiveCardLayout ? `${responsivePlanLayout.gap}px` : [4, 6, 8]}
          w={
            responsiveCardLayout
              ? `${
                  responsivePlanLayout.cardWidth * responsivePlanLayout.columnCount +
                  responsivePlanLayout.gap * (responsivePlanLayout.columnCount - 1)
                }px`
              : '100%'
          }
          maxW={'100%'}
          flexWrap={responsiveCardLayout ? undefined : ['wrap', 'nowrap']}
          justifyContent={'center'}
        >
          {standardSubList.map((item) => {
            const packageChangeStatus = getStandardPackageChangeStatus({
              currentLevel: myStandardPlan?.currentSubLevel,
              targetLevel: item.level
            });
            const isCurrentPlan = packageChangeStatus === PackageChangeStatusEnum.renewal;
            const isActivityPlan =
              item.level === StandardSubLevelEnum.advanced ||
              item.level === StandardSubLevelEnum.basic;

            const isHigherLevel = packageChangeStatus === PackageChangeStatusEnum.upgrade;

            return (
              <Box
                key={item.level}
                pos={'relative'}
                overflow={'hidden'}
                display={'flex'}
                flexDirection={'column'}
                alignItems={'flex-start'}
                flexShrink={0}
                w={responsiveCardLayout ? '100%' : ['100%', '300px']}
                h={['auto', '777px']}
                p={'28px'}
                borderRadius={'16px'}
                borderWidth={isCurrentPlan ? '2px' : '1.5px'}
                borderColor={
                  isCurrentPlan
                    ? hasActivityExpiration && isActivityPlan
                      ? '#BB182C'
                      : 'primary.600'
                    : '#F0F1F6'
                }
                bg={'rgba(255, 255, 255, 0.90)'}
                boxShadow={'0 1px 2px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.15)'}
              >
                {hasActivityExpiration &&
                  (item.level === StandardSubLevelEnum.basic ||
                    item.level === StandardSubLevelEnum.advanced) && (
                    <>
                      <Box
                        position={'absolute'}
                        top={24}
                        left={0}
                        w={'29px'}
                        h={'12px'}
                        bgImage={"url('/imgs/system/ribbonLeft.svg')"}
                        bgSize={'contain'}
                        bgRepeat={'no-repeat'}
                        zIndex={0}
                      />
                      <Box
                        position={'absolute'}
                        top={4}
                        right={0}
                        w={'136px'}
                        h={'170px'}
                        bgImage={"url('/imgs/system/ribbonRight.svg')"}
                        bgSize={'contain'}
                        bgRepeat={'no-repeat'}
                        zIndex={0}
                      />
                      <Box
                        position={'absolute'}
                        bottom={0}
                        right={0}
                        w={'78px'}
                        h={'81px'}
                        bgImage={"url('/imgs/system/snowflake.svg')"}
                        bgSize={'contain'}
                        bgRepeat={'no-repeat'}
                        zIndex={0}
                      />
                    </>
                  )}
                {hasActivityExpiration &&
                  (item.level === StandardSubLevelEnum.basic ||
                    item.level === StandardSubLevelEnum.advanced) && (
                    <Box
                      position={'absolute'}
                      top={0}
                      left={0}
                      right={0}
                      h={'28px'}
                      bg={'linear-gradient(180deg, #FFE0EB 7.14%, rgba(255, 255, 255, 0.00) 100%)'}
                      backdropFilter={'blur(0px)'}
                      zIndex={1}
                      display={'flex'}
                      alignItems={'center'}
                      justifyContent={'center'}
                    >
                      <Box
                        fontSize={'12px'}
                        fontWeight={'500'}
                        color={'#E45F5F'}
                        textAlign={'center'}
                      >
                        {activityExpirationTime}
                      </Box>
                    </Box>
                  )}
                {isCurrentPlan && !hasActivityExpiration && (
                  <Box
                    position={'absolute'}
                    right={0}
                    top={'1.62rem'}
                    px={3}
                    py={'0.38rem'}
                    color={'blue.700'}
                    fontSize={'xs'}
                    bg={'blue.200'}
                    fontWeight={'500'}
                    borderLeftRadius={'sm'}
                  >
                    {t('price:is_using')}
                  </Box>
                )}
                <Box
                  fontSize={'md'}
                  fontWeight={'500'}
                  color={'myGray.900'}
                  mt={hasActivityExpiration ? 2 : 0}
                >
                  {t(item.label as any)}
                </Box>
                <Flex alignItems={'center'}>
                  {item.level === StandardSubLevelEnum.custom ? (
                    <Box
                      fontSize={['32px', '36px']}
                      py={1.5}
                      fontWeight={'bold'}
                      color={'myGray.900'}
                    >
                      {t('price:custom_plan_price')}
                    </Box>
                  ) : (
                    <Box
                      py={1}
                      borderRadius={20}
                      display={'inline-block'}
                      zIndex={10}
                      pr={8}
                      bgGradient={'linear(to-r, #fff 90%, transparent)'}
                    >
                      <Flex
                        fontSize={['32px', '42px']}
                        fontWeight={'bold'}
                        color={'myGray.900'}
                        alignItems={'end'}
                        gap={1}
                      >
                        ￥
                        {matchedCoupon?.discount && item.price > 0
                          ? Number.isInteger(matchedCoupon.discount * item.price)
                            ? matchedCoupon.discount * item.price
                            : (matchedCoupon.discount * item.price).toFixed(1)
                          : item.price}
                        {item.level !== StandardSubLevelEnum.free && matchedCoupon && (
                          <Box
                            h={[8, '38px']}
                            color={'primary.600'}
                            fontSize={'18px'}
                            fontWeight={'500'}
                            whiteSpace={'nowrap'}
                          >
                            {isChinese
                              ? t('price:coupon_discount_rate', {
                                  discount: (matchedCoupon.discount * 10).toFixed(0)
                                })
                              : t('price:coupon_percent_off', {
                                  discount: ((1 - matchedCoupon.discount) * 100).toFixed(0)
                                })}
                          </Box>
                        )}
                      </Flex>
                    </Box>
                  )}
                </Flex>
                <Box color={'myGray.500'} minH={'40px'} fontSize={'xs'}>
                  {t(item.desc as any, { title: feConfigs?.systemTitle })}
                </Box>

                {/* Button */}
                {(() => {
                  const buttonHeight = 10;
                  const buttonMarginTop = 4;
                  const buttonMarginBottom = 6;

                  if (item.level === StandardSubLevelEnum.free) {
                    return (
                      <Button
                        mt={buttonMarginTop}
                        mb={buttonMarginBottom}
                        h={buttonHeight}
                        _active={{}}
                        _hover={{}}
                        boxShadow={'0'}
                        cursor={'default'}
                        w={'100%'}
                        isDisabled
                        variant={'whiteBase'}
                      >
                        {t('price:free')}
                      </Button>
                    );
                  }
                  if (item.level === StandardSubLevelEnum.custom) {
                    return (
                      <Button
                        mt={buttonMarginTop}
                        mb={buttonMarginBottom}
                        h={buttonHeight}
                        w={'100%'}
                        variant={'primaryGhost'}
                        onClick={() => {
                          if (item.customFormUrl) {
                            window.open(item.customFormUrl, '_blank');
                          }
                        }}
                      >
                        {t('price:contact_business')}
                      </Button>
                    );
                  }
                  if (isCurrentPlan) {
                    return (
                      <Button
                        mt={buttonMarginTop}
                        mb={buttonMarginBottom}
                        h={buttonHeight}
                        w={'100%'}
                        isLoading={isLoading}
                        variant={hasActivityExpiration ? 'solid' : 'primary'}
                        {...(hasActivityExpiration && {
                          bg: '#ED372C',
                          color: 'white',
                          borderRadius: '6px',
                          _hover: { bg: '#DE0D00' },
                          sx: {
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
                          }
                        })}
                        onClick={() => {
                          submitStandardPurchase({
                            type: 'standard',
                            packageChange: PackageChangeStatusEnum.renewal,
                            level: item.level as StandardSubLevelEnum,
                            subMode: selectSubMode
                          });
                        }}
                      >
                        {t('price:bill.renew_plan')}
                      </Button>
                    );
                  }
                  if (isHigherLevel) {
                    return (
                      <Button
                        mt={buttonMarginTop}
                        mb={buttonMarginBottom}
                        h={buttonHeight}
                        w={'100%'}
                        variant={'primaryGhost'}
                        isLoading={isLoading}
                        onClick={() => {
                          submitStandardPurchase({
                            type: 'standard',
                            packageChange: PackageChangeStatusEnum.upgrade,
                            level: item.level as StandardSubLevelEnum,
                            subMode: selectSubMode
                          });
                        }}
                      >
                        {t('price:support.wallet.subscription.Upgrade plan')}
                      </Button>
                    );
                  }
                  return (
                    <Button
                      mt={buttonMarginTop}
                      mb={buttonMarginBottom}
                      h={buttonHeight}
                      w={'100%'}
                      {...(hasActivityExpiration
                        ? {
                            variant: 'outline',
                            borderColor: '#ED372C',
                            color: '#ED372C',
                            _hover: { bg: 'rgba(237, 55, 44, 0.1)' }
                          }
                        : {
                            variant: 'primaryGhost'
                          })}
                      isLoading={isLoading}
                      onClick={() => {
                        submitStandardPurchase({
                          type: 'standard',
                          packageChange: PackageChangeStatusEnum.buy,
                          level: item.level as StandardSubLevelEnum,
                          subMode: selectSubMode
                        });
                      }}
                    >
                      {t('price:bill.buy_plan')}
                    </Button>
                  );
                })()}

                {/* function list */}
                {item.level === StandardSubLevelEnum.custom ? (
                  <Grid gap={4} fontSize={'sm'}>
                    <Flex alignItems={'center'}>
                      <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
                      <Box color={'myGray.600'}>{t('price:custom_plan_feature_1')}</Box>
                    </Flex>
                    <Flex alignItems={'center'}>
                      <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
                      <Box color={'myGray.600'}>{t('price:custom_plan_feature_2')}</Box>
                    </Flex>
                    <Flex alignItems={'center'}>
                      <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
                      <Box color={'myGray.600'}>{t('price:custom_plan_feature_3')}</Box>
                    </Flex>
                    <Flex alignItems={'center'}>
                      <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
                      <Box color={'myGray.600'}>{t('price:custom_plan_feature_4')}</Box>
                    </Flex>
                  </Grid>
                ) : (
                  <StandardPlanContentList level={item.level} mode={selectSubMode} />
                )}
              </Box>
            );
          })}
        </Flex>

        {!!qrPayData && packageChange && (
          <QRCodePayModal
            tip={packagePayTextMap[packageChange]}
            onSuccess={onPaySuccess}
            discountCouponName={matchedCoupon?.name}
            onClose={async () => {
              setQRPayData(undefined);
              await getCoupons();
            }}
            {...qrPayData}
          />
        )}
      </Flex>
    </>
  );
};

export default React.memo(Standard);
