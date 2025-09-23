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
import {
  getMonthByPoints,
  getMinPointsByMonth,
  calculatePrice
} from '@fastgpt/global/support/wallet/bill/tools';

const ExtraPlan = ({ onPaySuccess }: { onPaySuccess?: () => void }) => {
  const { t } = useTranslation();
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

  // extra ai points
  const expireSelectorOptions: { label: string; value: number }[] = [
    { label: t('common:date_1_month'), value: 1 },
    { label: t('common:date_3_months'), value: 3 },
    { label: t('common:date_6_months'), value: 6 },
    { label: t('common:date_12_months'), value: 12 }
  ];
  const extraPointsPrice = subPlans?.extraPoints?.price || 0;
  const {
    watch: watchExtraPoints,
    setValue: setValueExtraPoints,
    getValues: getValuesExtraPoints
  } = useForm({
    defaultValues: {
      points: 1,
      month: 1
    }
  });

  // 监听积分和月份变化
  const watchedPoints = watchExtraPoints('points');
  const watchedMonth = watchExtraPoints('month');

  const { runAsync: onclickBuyExtraPoints, loading: isLoadingBuyExtraPoints } = useRequest2(
    async ({ points, month }: { points: number; month: number }) => {
      points = Math.ceil(points);
      month = Math.ceil(month);

      const payAmount = points * 1 * extraPointsPrice;

      if (payAmount === 0) {
        return toast({
          status: 'warning',
          title: t('common:support.wallet.amount_0')
        });
      }

      const res = await postCreatePayBill({
        type: BillTypeEnum.extraPoints,
        extraPoints: points
      });

      setQRPayData({
        tip: t('common:button.extra_points_tip'),
        ...res
      });
    },
    {
      manual: true,
      refreshDeps: [extraPointsPrice]
    }
  );

  return (
    <VStack>
      <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={5} w={['100%', 'auto']}>
        {/* points */}
        <Flex
          flexDir="column"
          bg={'rgba(255, 255, 255, 0.90)'}
          w={['100%', '500px']}
          px={'32px'}
          py={'24px'}
          borderRadius={'2xl'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          boxShadow={'1.5'}
          gap={4}
        >
          <Flex borderBottomWidth={'1px'} borderBottomColor={'myGray.200'} pb={1}>
            <Flex flexDir="column" gap={3} flex={'1 0 0'}>
              <Box fontSize={'lg'} fontWeight={'500'} color={'primary.700'}>
                {t('common:support.wallet.subscription.Extra ai points')}
              </Box>
              <Box fontSize={['28px', '32px']} fontWeight={'bold'} color={'black'}>
                {`￥${extraPointsPrice}/1000` + t('common:support.wallet.subscription.point')}
              </Box>
              <Box mt="auto" fontSize={'xs'} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Extra ai points description')}
              </Box>
            </Flex>
            <MyIcon
              display={['none', 'block']}
              mt={'-30px'}
              transform={'translateX(20px)'}
              name={'support/bill/extraPoints'}
              fill={'none'}
            />
          </Flex>
          <Flex flexDir="column" gap={4} h={'180px'} w={'100%'}>
            <Flex color={'myGray.900'}>
              <MyIcon
                mr={2}
                name={'support/bill/shoppingCart'}
                fontWeight={'500'}
                w={'16px'}
                color={'primary.600'}
              />
              {t('common:support.wallet.buy_ai_points')}
            </Flex>
            <Flex alignItems={'center'} fontSize={'sm'} h="36px">
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Points amount')}
              </Box>
              <Flex
                justifyContent={'end'}
                alignItems={'center'}
                mt={1}
                w={'180px'}
                position={'relative'}
              >
                <MyNumberInput
                  value={watchedPoints}
                  max={10000}
                  min={0}
                  size={'sm'}
                  onChange={(val) => {
                    setValueExtraPoints('points', val as unknown as number);
                  }}
                  onBlur={(val) => {
                    const formatVal = val || 1;
                    setValueExtraPoints('points', formatVal);

                    const expectedMonth = getMonthByPoints(formatVal);
                    if (expectedMonth !== watchedMonth) {
                      setValueExtraPoints('month', expectedMonth);
                    }
                  }}
                />
                <Box flexShrink={0} color={'myGray.600'}>
                  &nbsp;{`X 1000${t('common:support.wallet.subscription.point')}`}
                </Box>
              </Flex>
            </Flex>
            <Flex alignItems={'center'} fontSize={'sm'} h="36px">
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:invalid_time')}
              </Box>
              <Flex
                justifyContent={'end'}
                alignItems={'center'}
                mt={1}
                w={'180px'}
                position={'relative'}
              >
                <MySelect
                  bg={'myGray.50'}
                  value={watchedMonth}
                  size={'sm'}
                  list={expireSelectorOptions}
                  onChange={(val) => {
                    setValueExtraPoints('month', val);
                    // 当用户选择月份时，设置积分为该月份的最小值
                    const minPoints = getMinPointsByMonth(val);
                    setValueExtraPoints('points', minPoints);
                  }}
                />
              </Flex>
            </Flex>
            <Flex alignItems={'end'} fontSize={'sm'} h="36px">
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Update extra price')}
              </Box>
              <Flex
                justifyContent={'end'}
                alignItems={'center'}
                mt={1}
                w={'180px'}
                position={'relative'}
                fontWeight={500}
                fontSize={'20px'}
              >
                {`￥${(() => {
                  const price = calculatePrice(extraPointsPrice, {
                    type: 'points',
                    points: watchedPoints
                  });
                  return Number.isNaN(price) ? 0 : price;
                })()}`}
              </Flex>
            </Flex>
          </Flex>
          <Box mt={'auto'}>
            <Button
              w={'100%'}
              h={'44px'}
              variant={'primaryGhost'}
              isLoading={isLoadingBuyExtraPoints}
              onClick={() => {
                const values = getValuesExtraPoints();
                const points = values.points || 1; // 如果为空，默认为1
                const month = values.month || 1;
                onclickBuyExtraPoints({ points, month });
              }}
              color={'primary.700'}
            >
              {t('common:support.wallet.Buy')}
            </Button>
            <HStack color={'blue.700'} mt={4}>
              <MyIcon name={'infoRounded'} w={'1rem'} />
              <Box fontSize={'sm'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Update extra ai points tips')}
              </Box>
            </HStack>
          </Box>
        </Flex>

        {/* dataset */}
        <Flex
          flexDir="column"
          bg={'rgba(255, 255, 255, 0.90)'}
          px={'32px'}
          py={'24px'}
          borderRadius={'2xl'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          boxShadow={'1.5'}
          w={['100%', '500px']}
          gap={4}
        >
          <Flex borderBottomWidth={'1px'} borderBottomColor={'myGray.200'} pb={1}>
            <Flex flexDir="column" gap={3} flex={'1 0 0'}>
              <Box fontSize={'lg'} fontWeight={'500'} color={'primary.700'}>
                {t('common:support.wallet.subscription.Extra dataset size')}
              </Box>
              <Box fontSize={['28px', '32px']} fontWeight={'bold'} color={'black'}>
                {`￥${extraDatasetPrice}/1000${t('common:support.wallet.subscription.Extra dataset unit')}`}
              </Box>
              <Box mt="auto" fontSize={'xs'} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Extra dataset description')}
              </Box>
            </Flex>
            <MyIcon
              display={['none', 'block']}
              mt={'-30px'}
              transform={'translateX(20px)'}
              name={'support/bill/extraDatasetsize'}
              fill={'none'}
            />
          </Flex>

          <Flex flexDir="column" gap={4} h={'180px'} w={'100%'}>
            <Flex color={'myGray.900'}>
              <MyIcon
                mr={2}
                name={'support/bill/shoppingCart'}
                fontWeight={'500'}
                w={'16px'}
                color={'primary.600'}
              />
              {t('common:support.wallet.buy_dataset_capacity')}
            </Flex>
            <Flex alignItems={'center'} fontSize={'sm'}>
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Dataset size')}
              </Box>
              <Flex
                justifyContent={'end'}
                alignItems={'center'}
                mt={1}
                w={'180px'}
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
                justifyContent={'end'}
                alignItems={'center'}
                mt={1}
                w={'180px'}
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
            <Flex alignItems={'end'} fontSize={'sm'} h="36px">
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Update extra price')}
              </Box>
              <Flex
                justifyContent={'end'}
                alignItems={'center'}
                mt={1}
                w={'180px'}
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
          <Box mt={'auto'}>
            <Button
              w={'100%'}
              h={'44px'}
              variant={'primaryGhost'}
              isLoading={isLoadingBuyDatasetSize}
              onClick={handleSubmitDatasetSize(onclickBuyDatasetSize)}
              color={'primary.700'}
            >
              {t('common:support.wallet.Buy')}
            </Button>
            <HStack color={'blue.700'} mt={4}>
              <MyIcon name={'infoRounded'} w={'1rem'} />
              <Box fontSize={'sm'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Update extra dataset tips')}
              </Box>
            </HStack>
          </Box>
        </Flex>
      </Grid>

      {!!qrPayData && <QRCodePayModal onSuccess={onPaySuccess} {...qrPayData} />}
    </VStack>
  );
};

export default React.memo(ExtraPlan);
