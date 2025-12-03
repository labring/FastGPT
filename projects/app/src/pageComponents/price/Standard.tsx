import React, { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { type TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';
import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import { getDiscountCouponList, postCreatePayBill } from '@/web/support/wallet/bill/api';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  DiscountCouponStatusEnum,
  DiscountCouponTypeEnum
} from '@fastgpt/global/support/wallet/discountCoupon/constants';

export enum PackageChangeStatusEnum {
  buy = 'buy',
  renewal = 'renewal',
  upgrade = 'upgrade'
}

const Standard = ({
  standardPlan: myStandardPlan,
  onPaySuccess
}: {
  standardPlan?: TeamSubSchema;
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

  const NEW_PLAN_LEVELS = [
    StandardSubLevelEnum.free,
    StandardSubLevelEnum.basic,
    StandardSubLevelEnum.advanced,
    StandardSubLevelEnum.custom
  ];
  const { data: coupons = [], loading } = useRequest2(
    async () => {
      if (!myStandardPlan?.teamId) return [];
      return getDiscountCouponList(myStandardPlan.teamId);
    },
    {
      manual: !myStandardPlan?.teamId,
      refreshDeps: [myStandardPlan?.teamId]
    }
  );

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
              totalPoints: value.totalPoints * (selectSubMode === SubModeEnum.month ? 1 : 12),

              // custom plan
              priceDescription: value.priceDescription,
              customDescriptions: value.customDescriptions,
              customFormUrl: value.customFormUrl
            };
          })
      : [];
  }, [subPlans?.standard, selectSubMode]);

  // Pay code
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  /* Get pay code */
  const { runAsync: onPay, loading: isLoading } = useRequest2(postCreatePayBill, {
    onSuccess(res) {
      setQRPayData(res);
    }
  });

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

            const isHigherLevel =
              standardSubLevelMap[item.level].weight >
              standardSubLevelMap[myStandardPlan?.currentSubLevel || StandardSubLevelEnum.free]
                .weight;

            return (
              <Box
                key={item.level}
                pos={'relative'}
                flex={'1 0 0'}
                bg={isCurrentPlan ? 'blue.50' : 'rgba(255, 255, 255, 0.90)'}
                p={'28px'}
                borderRadius={'xl'}
                borderWidth={isCurrentPlan ? '4px' : '1.5px'}
                boxShadow={'1.5'}
                {...(isCurrentPlan
                  ? {
                      borderColor: 'primary.600'
                    }
                  : {
                      borderColor: 'myGray.150'
                    })}
              >
                {isCurrentPlan && (
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
                <Box fontSize={'md'} fontWeight={'500'} color={'myGray.900'}>
                  {t(item.label as any)}
                </Box>
                <Flex alignItems={'center'} gap={2.5}>
                  {item.level === StandardSubLevelEnum.custom ? (
                    <Box
                      fontSize={['32px', '36px']}
                      py={1.5}
                      fontWeight={'bold'}
                      color={'myGray.900'}
                    >
                      {item.priceDescription || t('common:custom_plan_price')}
                    </Box>
                  ) : (
                    <MyBox
                      isLoading={loading}
                      fontSize={['32px', '42px']}
                      fontWeight={'bold'}
                      color={'myGray.900'}
                    >
                      ￥
                      {matchedCoupon?.discount && item.price > 0
                        ? (matchedCoupon.discount * item.price).toFixed(1)
                        : item.price}
                    </MyBox>
                  )}
                  {item.level !== StandardSubLevelEnum.free &&
                    item.level !== StandardSubLevelEnum.custom &&
                    matchedCoupon && (
                      <Box
                        h={4}
                        color={'primary.600'}
                        fontSize={'18px'}
                        fontWeight={'500'}
                        whiteSpace={'nowrap'}
                      >
                        {`${(matchedCoupon.discount * 10).toFixed(0)} 折`}
                      </Box>
                    )}
                </Flex>
                <Box color={'myGray.500'} minH={'40px'} fontSize={'xs'}>
                  {t(item.desc as any, { title: feConfigs?.systemTitle })}
                </Box>

                {/* Button */}
                {(() => {
                  if (item.level === StandardSubLevelEnum.free) {
                    return (
                      <Button
                        mt={4}
                        mb={6}
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
                        mt={4}
                        mb={6}
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
                        mt={4}
                        mb={6}
                        w={'100%'}
                        variant={'primary'}
                        isLoading={isLoading}
                        onClick={() => {
                          setPackageChange(PackageChangeStatusEnum.renewal);
                          onPay({
                            type: BillTypeEnum.standSubPlan,
                            level: item.level,
                            subMode: selectSubMode,
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
                        mt={4}
                        mb={6}
                        w={'100%'}
                        variant={'primaryGhost'}
                        isLoading={isLoading}
                        onClick={() => {
                          setPackageChange(PackageChangeStatusEnum.upgrade);
                          onPay({
                            type: BillTypeEnum.standSubPlan,
                            level: item.level,
                            subMode: selectSubMode,
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
                      mt={4}
                      mb={6}
                      w={'100%'}
                      variant={'primaryGhost'}
                      isLoading={isLoading}
                      onClick={() => {
                        setPackageChange(PackageChangeStatusEnum.buy);
                        onPay({
                          type: BillTypeEnum.standSubPlan,
                          level: item.level,
                          subMode: selectSubMode,
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
                    {item.customDescriptions?.map((desc, index) => (
                      <Flex key={index} alignItems={'center'}>
                        <MyIcon name={'price/right'} w={'16px'} mr={3} />
                        <Box color={'myGray.600'}>{desc}</Box>
                      </Flex>
                    ))}
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
