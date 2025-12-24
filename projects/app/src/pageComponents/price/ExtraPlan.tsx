import { Box, Flex, Grid, Button, VStack, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { postCreatePayBill } from '@/web/support/wallet/bill/api';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { calculatePrice } from '@fastgpt/global/support/wallet/bill/tools';
import { formatNumberWithUnit } from '@fastgpt/global/common/string/tools';
import { formatActivityExpirationTime } from './utils';

const ExtraPlan = ({ onPaySuccess }: { onPaySuccess?: () => void }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { subPlans } = useSystemStore();
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  // 额外的知识库索引量
  const extraDatasetPrice = subPlans?.extraDatasetSize?.price || 0;
  const {
    watch: watchDatasetSize,
    register: registerDatasetSize,
    handleSubmit: handleSubmitDatasetSize,
    setValue: setValueDatasetSize
  } = useForm({
    defaultValues: {
      datasetSize: 1,
      month: 1
    }
  });

  const watchedDatasetSize = watchDatasetSize('datasetSize');
  const watchedDatasetMonth = watchDatasetSize('month');

  const { runAsync: onclickBuyDatasetSize, loading: isLoadingBuyDatasetSize } = useRequest2(
    async ({ datasetSize, month }: { datasetSize: number; month: number }) => {
      datasetSize = Math.ceil(datasetSize);
      month = Math.ceil(month);

      const datasetSizePayAmount = datasetSize * month * extraDatasetPrice;
      if (datasetSizePayAmount === 0) {
        return toast({
          status: 'warning',
          title: t('common:support.wallet.amount_0')
        });
      }

      const res = await postCreatePayBill({
        type: BillTypeEnum.extraDatasetSub,
        month,
        extraDatasetSize: datasetSize
      });
      setQRPayData({
        tip: t('common:button.extra_dataset_size_tip'),
        ...res
      });
    },
    {
      manual: true,
      refreshDeps: [extraDatasetPrice]
    }
  );

  const expireSelectorOptions: { label: string; value: number }[] = [
    { label: t('common:date_1_month'), value: 1 },
    { label: t('common:date_3_months'), value: 3 },
    { label: t('common:date_6_months'), value: 6 },
    { label: t('common:date_12_months'), value: 12 }
  ];

  const extraPointsPackages = subPlans?.extraPoints?.packages || [];
  const [selectedPackageIndex, setSelectedPackageIndex] = useState<number>(0);

  const getMonthText = (month: number) => {
    if (month < 12) return `${month} ${t('common:month_text')}`;
    return t('common:one_year');
  };

  const { runAsync: onclickBuyExtraPoints, loading: isLoadingBuyExtraPoints } = useRequest2(
    async ({ points, month }: { points: number; month: number }) => {
      points = Math.ceil(points);
      month = Math.ceil(month);

      const res = await postCreatePayBill({
        type: BillTypeEnum.extraPoints,
        extraPoints: points,
        month: month
      });

      setQRPayData({
        tip: t('common:button.extra_points_tip'),
        ...res
      });
    },
    {
      manual: true,
      refreshDeps: [extraPointsPackages]
    }
  );

  // 计算活动时间
  const { text: activityExpirationTime } = formatActivityExpirationTime(
    subPlans?.activityExpirationTime
  );

  return (
    <VStack>
      <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={5} w={['100%', 'auto']}>
        <Box
          position={'relative'}
          bg={'white'}
          w={'100%'}
          px={[4, 8]}
          py={[4, 6]}
          borderRadius={'16px'}
          borderWidth={'1px'}
          borderColor={'myGray.200'}
          boxShadow={'0 1px 2px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.15)'}
          overflow={'hidden'}
        >
          {subPlans?.activityExpirationTime && (
            <>
              <Box
                position={'absolute'}
                top={8}
                left={'36%'}
                width={'55px'}
                height={'64px'}
                zIndex={0}
                bgImage={'url(/imgs/system/extraSnowflake1.svg)'}
                backgroundSize="100% 100%"
                backgroundRepeat="no-repeat"
              />
              <Box
                position={'absolute'}
                top={1}
                left={'60%'}
                width={'25px'}
                height={'25px'}
                zIndex={0}
                bgImage={'url(/imgs/system/extraSnowflake2.svg)'}
                backgroundSize="100% 100%"
                backgroundRepeat="no-repeat"
              />
              <Box
                position={'absolute'}
                top={1}
                right={3}
                width={'67px'}
                height={'72px'}
                zIndex={0}
                bgImage={'url(/imgs/system/extraSnowflake3.svg)'}
                backgroundSize="100% 100%"
                backgroundRepeat="no-repeat"
              />
            </>
          )}
          <Box
            position={'relative'}
            zIndex={1}
            fontSize={'18px'}
            fontWeight={'500'}
            color={'primary.700'}
            pb={subPlans?.activityExpirationTime ? 2 : 6}
            borderBottomWidth={'1px'}
            borderBottomColor={'myGray.200'}
          >
            {t('common:support.wallet.subscription.Extra ai points')}
            <Box fontSize={'12px'} fontWeight={'normal'} color={'myGray.600'} mt={0.5}>
              {activityExpirationTime}
            </Box>
          </Box>
          <Grid
            position={'relative'}
            zIndex={1}
            gridTemplateColumns={['repeat(2, 1fr)', 'repeat(3, 1fr)']}
            gap={[2, 3]}
            py={[3, 4]}
            minHeight={['180px', '220px']}
          >
            {extraPointsPackages.map((pkg, index) => (
              <Flex
                key={index}
                flexDir={'column'}
                alignItems={'center'}
                justifyContent={'center'}
                py={extraPointsPackages.length > 6 ? 1 : 2}
                px={[3, 4]}
                borderRadius={['8px', 'sm']}
                borderWidth={'1px'}
                borderColor={selectedPackageIndex === index ? '#3E78FF' : 'myGray.200'}
                bg={selectedPackageIndex === index ? 'primary.25' : 'white'}
                cursor={'pointer'}
                _hover={{
                  borderColor: '#3E78FF',
                  bg: 'primary.25'
                }}
                onClick={() => setSelectedPackageIndex(index)}
                transition={'all 0.2s'}
                position={'relative'}
                overflow={'hidden'}
              >
                {!!pkg.activityBonusPoints && (
                  <Flex
                    position={'absolute'}
                    top={0.5}
                    right={-8}
                    minW={24}
                    py={0.5}
                    justifyContent={'center'}
                    fontSize={'10px'}
                    fontWeight={'bold'}
                    color={'white'}
                    bg={'#ED372C'}
                    transform={'rotate(37deg)'}
                    whiteSpace={'nowrap'}
                  >
                    +{formatNumberWithUnit(pkg.activityBonusPoints, i18n.language)}
                  </Flex>
                )}
                <Box fontSize={'24px'} fontWeight={'medium'} color={'myGray.600'}>
                  {formatNumberWithUnit(pkg.points, i18n.language)}{' '}
                  <Box as={'span'} fontSize={'12px'}>
                    {t('common:support.wallet.subscription.point')}
                  </Box>
                </Box>
                <Box
                  fontSize={['10px', '12px']}
                  fontWeight={'medium'}
                  color={'myGray.500'}
                  mt={[1, 2]}
                >
                  {t('common:invalid_time') + ' '}
                  {getMonthText(pkg.month)}
                </Box>
              </Flex>
            ))}
          </Grid>

          <Flex
            position={'relative'}
            zIndex={1}
            justifyContent={'space-between'}
            alignItems={'center'}
          >
            <Box
              fontSize={['13px', '14px']}
              color={'myGray.600'}
              fontWeight={'medium'}
              textAlign={['center', 'left']}
            >
              {t('common:support.wallet.subscription.total_points')}
            </Box>
            <Box color={'myGray.600'} fontSize={['18px', '20px']} fontWeight={'medium'}>
              {selectedPackageIndex !== undefined && extraPointsPackages[selectedPackageIndex]
                ? formatNumberWithUnit(
                    extraPointsPackages[selectedPackageIndex].points +
                      (extraPointsPackages[selectedPackageIndex]?.activityBonusPoints || 0),
                    i18n.language
                  )
                : '--'}
            </Box>
          </Flex>
          <Flex
            position={'relative'}
            zIndex={1}
            justifyContent={'space-between'}
            alignItems={'center'}
          >
            <Box
              fontSize={['13px', '14px']}
              color={'myGray.600'}
              fontWeight={'medium'}
              textAlign={['center', 'left']}
            >
              {t('common:support.wallet.subscription.Update extra price')}
            </Box>
            <Box color={'myGray.600'} fontSize={['18px', '20px']} fontWeight={'medium'}>
              {selectedPackageIndex !== undefined && extraPointsPackages[selectedPackageIndex]
                ? t('common:extraPointsPrice', {
                    price: extraPointsPackages[selectedPackageIndex].price
                  })
                : '--'}
            </Box>
          </Flex>

          <Button
            position={'relative'}
            zIndex={1}
            w={'100%'}
            h={['40px', '44px']}
            variant={'primaryGhost'}
            isLoading={isLoadingBuyExtraPoints}
            isDisabled={
              selectedPackageIndex === undefined || !extraPointsPackages[selectedPackageIndex]
            }
            onClick={() => {
              if (selectedPackageIndex !== undefined && extraPointsPackages[selectedPackageIndex]) {
                const selectedPackage = extraPointsPackages[selectedPackageIndex];
                onclickBuyExtraPoints({
                  points: selectedPackage.points,
                  month: selectedPackage.month
                });
              }
            }}
            fontSize={['14px', '16px']}
            color={'primary.700'}
            mt={[3, 4]}
          >
            {t('common:support.wallet.Buy')}
          </Button>

          <HStack position={'relative'} zIndex={1} color={'blue.700'} mt={[4, 6]} spacing={[2, 0]}>
            <MyIcon name={'infoRounded'} w={['16px', '18px']} />
            <Box fontSize={['12px', '14px']} fontWeight={'medium'} lineHeight={['1.4', 'normal']}>
              {t('common:support.wallet.subscription.Update extra ai points tips')}
            </Box>
          </HStack>
        </Box>

        {/* dataset */}
        <Flex
          bg={'white'}
          w={'100%'}
          px={[4, 8]}
          py={[4, 6]}
          borderRadius={'16px'}
          borderColor={'myGray.200'}
          boxShadow={'0 1px 2px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.15)'}
          flexDir="column"
          borderWidth={'1px'}
          gap={2}
        >
          <Flex borderBottomWidth={'1px'} borderBottomColor={'myGray.200'} pb={[2, 4]}>
            <Flex flexDir="column" gap={[2, 3]} flex={'1 0 0'}>
              <Box fontSize={['16px', '18px', 'lg']} fontWeight={'500'} color={'primary.700'}>
                {t('common:support.wallet.subscription.Extra dataset size')}
              </Box>
              <Box
                fontSize={['20px', '32px']}
                fontWeight={'bold'}
                color={'black'}
                lineHeight={['1.2', 'normal']}
              >
                {`￥${extraDatasetPrice}/1000${t('common:support.wallet.subscription.Extra dataset unit')}`}
              </Box>
              <Box
                mt="auto"
                fontSize={['10px', 'xs']}
                color={'myGray.600'}
                fontWeight={'500'}
                lineHeight={['1.3', 'normal']}
              >
                {t('common:support.wallet.subscription.Extra dataset description')}
              </Box>
            </Flex>
            <MyIcon
              display={['none', 'block']}
              mt={['-20px', '-30px']}
              transform={['translateX(10px)', 'translateX(20px)']}
              name={'support/bill/extraDatasetsize'}
              fill={'none'}
              w={['60px', 'auto']}
            />
          </Flex>

          <Flex flexDir="column" gap={[3, 4]} h={['auto', '180px']} w={'100%'}>
            <Flex color={'myGray.900'} alignItems={'center'}>
              <MyIcon
                mr={[2, 3]}
                name={'support/bill/shoppingCart'}
                fontWeight={'500'}
                w={['14px', '16px']}
                color={'primary.600'}
              />
              <Box fontSize={['14px', 'sm']} fontWeight={'500'}>
                {t('common:support.wallet.buy_dataset_capacity')}
              </Box>
            </Flex>

            <Flex alignItems={'center'} fontSize={'sm'}>
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Dataset size')}
              </Box>
              <Flex
                justifyContent={'end'}
                alignItems={'center'}
                mt={[0, 1]}
                w={['100%', '180px']}
                position={'relative'}
              >
                <MyNumberInput
                  name="datasetSize"
                  register={registerDatasetSize}
                  defaultValue={1}
                  max={10000}
                  min={0}
                  size={'sm'}
                />
                <Box flexShrink={0} color={'myGray.600'}>
                  &nbsp;{`X 1000${t('common:core.dataset.data.group')}`}
                </Box>
              </Flex>
            </Flex>

            <Flex alignItems={'center'} fontSize={'sm'}>
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:invalid_time')}
              </Box>
              <Flex
                justifyContent={['flex-start', 'end']}
                alignItems={'center'}
                mt={[0, 1]}
                w={['100%', '180px']}
                position={'relative'}
              >
                <MySelect
                  bg={'myGray.50'}
                  value={watchedDatasetMonth}
                  size={'sm'}
                  list={expireSelectorOptions}
                  onChange={(val) => setValueDatasetSize('month', val)}
                />
              </Flex>
            </Flex>

            <Flex alignItems={'end'} fontSize={'sm'} h="36px" gap={[2, 0]}>
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Update extra price')}
              </Box>
              <Flex
                justifyContent={['flex-start', 'end']}
                alignItems={'center'}
                mt={[0, 1]}
                w={['100%', '180px']}
                position={'relative'}
                fontWeight={500}
                fontSize={'20px'}
              >
                {`￥${(() => {
                  const price = calculatePrice(extraDatasetPrice, {
                    type: 'dataset',
                    size: watchedDatasetSize,
                    month: watchedDatasetMonth
                  });
                  return Number.isNaN(price) ? 0 : price;
                })()}`}
              </Flex>
            </Flex>
          </Flex>

          <Box mt={['auto', 4]}>
            <Button
              w={'100%'}
              h={['40px', '44px']}
              variant={'primaryGhost'}
              isLoading={isLoadingBuyDatasetSize}
              onClick={handleSubmitDatasetSize(onclickBuyDatasetSize)}
              color={'primary.700'}
              fontSize={['14px', '16px']}
            >
              {t('common:support.wallet.Buy')}
            </Button>

            <Flex color={'blue.700'} mt={5} alignItems={['flex-start', 'center']} gap={[2, 0]}>
              <MyIcon name={'infoRounded'} w={['14px', '1rem']} mt={['2px', 0]} />
              <Box fontSize={['12px', 'sm']} fontWeight={'500'} lineHeight={['1.4', 'normal']}>
                {t('common:support.wallet.subscription.Update extra dataset tips')}
              </Box>
            </Flex>
          </Box>
        </Flex>
      </Grid>

      {!!qrPayData && (
        <QRCodePayModal
          onSuccess={onPaySuccess}
          onClose={() => setQRPayData(undefined)}
          {...qrPayData}
        />
      )}
    </VStack>
  );
};

export default React.memo(ExtraPlan);
