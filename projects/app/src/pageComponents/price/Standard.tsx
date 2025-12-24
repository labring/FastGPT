import React, { useEffect, useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { type TeamSubSchemaType } from '@fastgpt/global/support/wallet/sub/type';
import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import { postCreatePayBill } from '@/web/support/wallet/bill/api';
import { getDiscountCouponList } from '@/web/support/wallet/sub/discountCoupon/api';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  DiscountCouponStatusEnum,
  DiscountCouponTypeEnum
} from '@fastgpt/global/support/wallet/sub/discountCoupon/constants';
import { formatActivityExpirationTime } from './utils';

export enum PackageChangeStatusEnum {
  buy = 'buy',
  renewal = 'renewal',
  upgrade = 'upgrade'
}
const NEW_PLAN_LEVELS = [
  StandardSubLevelEnum.free,
  StandardSubLevelEnum.basic,
  StandardSubLevelEnum.advanced,
  StandardSubLevelEnum.custom
];

const Standard = ({
  standardPlan: myStandardPlan,
  onPaySuccess
}: {
  standardPlan?: TeamSubSchemaType;
  onPaySuccess?: () => void;
}) => {
  const { t } = useTranslation();

  const packagePayTextMap = {
    [PackageChangeStatusEnum.buy]: t('common:pay.package_tip.buy'),
    [PackageChangeStatusEnum.renewal]: t('common:pay.package_tip.renewal'),
    [PackageChangeStatusEnum.upgrade]: t('common:pay.package_tip.upgrade')
  };

  const [packageChange, setPackageChange] = useState<PackageChangeStatusEnum>();
  const { subPlans, feConfigs } = useSystemStore();
  const [selectSubMode, setSelectSubMode] = useState<`${SubModeEnum}`>(SubModeEnum.month);
  const hasActivityExpiration =
    !!subPlans?.activityExpirationTime && selectSubMode === SubModeEnum.year;

  useEffect(() => {
    setSelectSubMode(subPlans?.activityExpirationTime ? SubModeEnum.year : SubModeEnum.month);
  }, [subPlans?.activityExpirationTime]);

  // 获取优惠券
  const { data: coupons = [], runAsync: getCoupons } = useRequest2(
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
              maxTeamMember: myStandardPlan?.maxTeamMember || value.maxTeamMember,
              maxAppAmount: myStandardPlan?.maxApp || value.maxAppAmount,
              maxDatasetAmount: myStandardPlan?.maxDataset || value.maxDatasetAmount,
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
    subPlans?.standard,
    selectSubMode,
    myStandardPlan?.maxTeamMember,
    myStandardPlan?.maxApp,
    myStandardPlan?.maxDataset
  ]);

  // Pay code
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  /* Get pay code */
  const { runAsync: onPay, loading: isLoading } = useRequest2(postCreatePayBill, {
    onSuccess(res) {
      setQRPayData(res);
    }
  });

  // 计算活动时间
  const { text: activityExpirationTime } = formatActivityExpirationTime(
    subPlans?.activityExpirationTime
  );

  return (
    <>
      <Flex flexDirection={'column'} alignItems={'center'} position={'relative'}>
        <Flex>
          <Box>
            <Box
              textAlign={'right'}
              color="#DC7E03"
              fontWeight="500"
              fontStyle="italic"
              fontFamily={'JiangChengXieHei'}
              fontSize={'14px'}
              lineHeight={'20px'}
              letterSpacing={'0.1px'}
              textTransform={'lowercase'}
              mb={2}
              mr={'-2'}
            >
              {t('common:pay_year_tip')}
            </Box>
            <RowTabs
              list={[
                {
                  label: t('common:support.wallet.subscription.mode.Month'),
                  value: SubModeEnum.month
                },
                {
                  label: (
                    <Box whiteSpace={'nowrap'}>
                      {t('common:support.wallet.subscription.mode.Year')}
                    </Box>
                  ),
                  value: SubModeEnum.year
                }
              ]}
              value={selectSubMode}
              onChange={(e) => setSelectSubMode(e as `${SubModeEnum}`)}
            />
          </Box>
          <MyIcon name={'price/pricearrow'} mt={'10px'} ml={'6px'} />
        </Flex>

        {/* card */}
        <Grid
          mt={[10, '48px']}
          gridTemplateColumns={['1fr', 'repeat(2,1fr)', `repeat(${standardSubList.length},1fr)`]}
          gap={[4, 6, 8]}
          w={'100%'}
          maxW={'1440px'}
          minH={'550px'}
        >
          {standardSubList.map((item) => {
            const isCurrentPlan = item.level === myStandardPlan?.currentSubLevel;
            const isActivityPlan =
              item.level === StandardSubLevelEnum.advanced ||
              item.level === StandardSubLevelEnum.basic;

            const isHigherLevel =
              standardSubLevelMap[item.level].weight >
              standardSubLevelMap[myStandardPlan?.currentSubLevel || StandardSubLevelEnum.free]
                .weight;

            return (
              <Box
                key={item.level}
                pos={'relative'}
                flex={'1 0 0'}
                bg={'rgba(255, 255, 255, 0.90)'}
                p={'28px'}
                borderRadius={'xl'}
                borderWidth={isCurrentPlan ? '2px' : '1.5px'}
                boxShadow={'1.5'}
                overflow={'hidden'}
                {...(isCurrentPlan
                  ? {
                      borderColor:
                        hasActivityExpiration && isActivityPlan ? '#BB182C' : 'primary.600'
                    }
                  : {
                      borderColor: 'myGray.150'
                    })}
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
                    {t('common:is_using')}
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
                      {t('common:custom_plan_price')}
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
                            {`${(matchedCoupon.discount * 10).toFixed(0)} 折`}
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
                        {t('common:free')}
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
                        {t('common:contact_business')}
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
                          setPackageChange(PackageChangeStatusEnum.renewal);
                          onPay({
                            type: BillTypeEnum.standSubPlan,
                            level: item.level as StandardSubLevelEnum,
                            subMode: selectSubMode as SubModeEnum,
                            discountCouponId: matchedCoupon?._id
                          });
                        }}
                      >
                        {t('user:bill.renew_plan')}
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
                          setPackageChange(PackageChangeStatusEnum.upgrade);
                          onPay({
                            type: BillTypeEnum.standSubPlan,
                            level: item.level as StandardSubLevelEnum,
                            subMode: selectSubMode as SubModeEnum,
                            discountCouponId: matchedCoupon?._id
                          });
                        }}
                      >
                        {t('common:support.wallet.subscription.Upgrade plan')}
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
                        setPackageChange(PackageChangeStatusEnum.buy);
                        onPay({
                          type: BillTypeEnum.standSubPlan,
                          level: item.level as StandardSubLevelEnum,
                          subMode: selectSubMode as SubModeEnum,
                          discountCouponId: matchedCoupon?._id
                        });
                      }}
                    >
                      {t('user:bill.buy_plan')}
                    </Button>
                  );
                })()}

                {/* function list */}
                {item.level === StandardSubLevelEnum.custom ? (
                  <Grid gap={4} fontSize={'sm'}>
                    <Flex alignItems={'center'}>
                      <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
                      <Box color={'myGray.600'}>{t('common:custom_plan_feature_1')}</Box>
                    </Flex>
                    <Flex alignItems={'center'}>
                      <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
                      <Box color={'myGray.600'}>{t('common:custom_plan_feature_2')}</Box>
                    </Flex>
                    <Flex alignItems={'center'}>
                      <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
                      <Box color={'myGray.600'}>{t('common:custom_plan_feature_3')}</Box>
                    </Flex>
                    <Flex alignItems={'center'}>
                      <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
                      <Box color={'myGray.600'}>{t('common:custom_plan_feature_4')}</Box>
                    </Flex>
                  </Grid>
                ) : (
                  <StandardPlanContentList level={item.level} mode={selectSubMode} />
                )}
              </Box>
            );
          })}
        </Grid>

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

const RowTabs = ({
  list,
  value,
  onChange
}: {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: string;
  }[];
  value: string;
  onChange: (e: string) => void;
}) => {
  return (
    <Box
      display={'inline-flex'}
      px={'3px'}
      py={'3px'}
      borderRadius={'md'}
      borderWidth={'1px'}
      borderColor={'primary.300'}
      bg={'primary.50'}
      gap={'4px'}
    >
      {list.map((item) => (
        <Flex
          key={item.value}
          alignItems={'center'}
          justifyContent={'center'}
          cursor={'pointer'}
          borderRadius={'sm'}
          px={'12px'}
          py={'7px'}
          userSelect={'none'}
          w={['150px', '190px']}
          {...(value === item.value
            ? {
                color: 'white',
                boxShadow: '1.5',
                bg: 'primary.600'
              }
            : {
                onClick: () => onChange(item.value)
              })}
        >
          {item.icon && <MyIcon name={item.icon as any} mr={1} w={'14px'} />}
          <Box fontWeight={'500'}>{item.label}</Box>
        </Flex>
      ))}
    </Box>
  );
};
