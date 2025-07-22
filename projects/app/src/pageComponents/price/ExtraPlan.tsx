import { Box, Flex, Grid, Button, VStack, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useState, useEffect } from 'react';
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
import { getComputedMonth } from '@fastgpt/global/support/wallet/bill/tools';

// 根据月份获取积分下限
const getMinPointsByMonth = (month: number): number => {
  switch (month) {
    case 12:
      return 200;
    case 6:
      return 100;
    case 3:
      return 50;
    case 1:
      return 1;
    default:
      return 1;
  }
};

const ExtraPlan = ({ onPaySuccess }: { onPaySuccess?: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { subPlans } = useSystemStore();
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  const expireSelectorOptions: { label: string; value: number }[] = [
    { label: t('common:support.wallet.subscription.Update extra expire 1 month'), value: 1 },
    { label: t('common:support.wallet.subscription.Update extra expire 3 months'), value: 3 },
    { label: t('common:support.wallet.subscription.Update extra expire 6 months'), value: 6 },
    { label: t('common:support.wallet.subscription.Update extra expire 12 months'), value: 12 }
  ];

  // 额外的知识库索引量
  const extraDatasetPrice = subPlans?.extraDatasetSize?.price || 0;
  const [datasetMonth, setDatasetMonth] = useState(1);
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

  // 同步月份到表单
  useEffect(() => {
    setValueDatasetSize('month', datasetMonth);
  }, [datasetMonth, setValueDatasetSize]);

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

  // 添加标记，避免月份变化时重置用户输入的积分
  const [isUserInputPoints, setIsUserInputPoints] = useState(false);

  // 当积分变化时，自动更新月份
  useEffect(() => {
    if (watchedPoints && watchedPoints > 0 && !isNaN(watchedPoints)) {
      const expectedMonth = getComputedMonth(watchedPoints);
      if (expectedMonth !== watchedMonth) {
        setValueExtraPoints('month', expectedMonth);
      }
    }
  }, [watchedPoints]);

  // 当月份变化时，设置积分为该月份的下限（仅在非用户输入时）
  useEffect(() => {
    if (watchedMonth && !isUserInputPoints) {
      const minPoints = getMinPointsByMonth(watchedMonth);
      if (watchedPoints !== minPoints) {
        setValueExtraPoints('points', minPoints);
      }
    }
    // 重置标记
    setIsUserInputPoints(false);
  }, [watchedMonth]);

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
        month,
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
        <Box
          bg={'rgba(255, 255, 255, 0.90)'}
          w={['100%', '500px']}
          px={'32px'}
          py={'24px'}
          borderRadius={'2xl'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          boxShadow={'1.5'}
        >
          <Flex borderBottomWidth={'1px'} borderBottomColor={'myGray.200'} pb={1}>
            <Box flex={'1 0 0'}>
              <Box fontSize={'lg'} fontWeight={'500'} color={'primary.700'}>
                {t('common:support.wallet.subscription.Extra ai points')}
              </Box>
              <Box mt={3} fontSize={['28px', '32px']} fontWeight={'bold'} color={'black'}>
                {`￥${extraPointsPrice}/1000` + t('common:support.wallet.subscription.point')}
              </Box>
              <Box mt={1} fontSize={'xs'} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Extra ai points description')}
              </Box>
            </Box>
            <MyIcon
              display={['none', 'block']}
              mt={'-30px'}
              transform={'translateX(20px)'}
              name={'support/bill/extraPoints'}
              fill={'none'}
            />
          </Flex>
          <Box h={'180px'} w={'100%'}>
            <Flex mt={4} color={'myGray.900'}>
              <MyIcon
                mr={2}
                name={'support/bill/shoppingCart'}
                fontWeight={'500'}
                w={'16px'}
                color={'primary.600'}
              />
              {t('common:support.wallet.buy_ai_points')}
            </Flex>
            <Flex mt={4} alignItems={'center'} fontSize={'sm'} h="36px">
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
                    setIsUserInputPoints(true);
                    // 过滤掉NaN和无效输入
                    if (val === ('' as unknown as number) || val === null || val === undefined) {
                      setValueExtraPoints('points', undefined as unknown as number);
                    } else if (!isNaN(val) && val >= 0) {
                      setValueExtraPoints('points', val as unknown as number);
                    }
                    // 如果是无效输入（如NaN），不做任何处理，保持当前值
                  }}
                />
                <Box flexShrink={0} color={'myGray.600'}>
                  &nbsp;{`X 1000${t('common:support.wallet.subscription.point')}`}
                </Box>
              </Flex>
            </Flex>
            <Flex mt={4} alignItems={'center'} fontSize={'sm'} h="36px">
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Update extra expire')}
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
                  onChange={(val) => setValueExtraPoints('month', val)}
                />
              </Flex>
            </Flex>
            <Flex mt={4} alignItems={'end'} fontSize={'sm'} h="36px">
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
                {`￥${15 * watchedPoints}`}
              </Flex>
            </Flex>
          </Box>
          <Button
            mt={6}
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

        {/* dataset */}
        <Box
          bg={'rgba(255, 255, 255, 0.90)'}
          px={'32px'}
          py={'24px'}
          borderRadius={'2xl'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          boxShadow={'1.5'}
          w={['100%', '500px']}
        >
          <Flex borderBottomWidth={'1px'} borderBottomColor={'myGray.200'} pb={1}>
            <Box flex={'1 0 0'}>
              <Box fontSize={'lg'} fontWeight={'500'} color={'primary.700'}>
                {t('common:support.wallet.subscription.Extra dataset size')}
              </Box>
              <Box mt={3} fontSize={['28px', '32px']} fontWeight={'bold'} color={'black'}>
                {`￥${extraDatasetPrice}/1000${t('common:support.wallet.subscription.Extra dataset unit')}`}
              </Box>
              <Box mt={1} fontSize={'xs'} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Extra dataset description')}
              </Box>
            </Box>
            <MyIcon
              display={['none', 'block']}
              mt={'-30px'}
              transform={'translateX(20px)'}
              name={'support/bill/extraDatasetsize'}
              fill={'none'}
            />
          </Flex>

          <Box h={'180px'} w={'100%'}>
            <Flex mt={4} color={'myGray.900'}>
              <MyIcon
                mr={2}
                name={'support/bill/shoppingCart'}
                fontWeight={'500'}
                w={'16px'}
                color={'primary.600'}
              />
              {t('common:support.wallet.buy_dataset_capacity')}
            </Flex>
            <Flex mt={4} alignItems={'center'} fontSize={'sm'}>
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
            <Flex mt={4} alignItems={'center'} fontSize={'sm'}>
              <Box flex={['0 0 100px', '1 0 0']} color={'myGray.600'} fontWeight={'500'}>
                {t('common:support.wallet.subscription.Update extra expire')}
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
                  value={datasetMonth}
                  size={'sm'}
                  list={expireSelectorOptions}
                  onChange={(val) => setDatasetMonth(val)}
                />
              </Flex>
            </Flex>
            <Flex mt={4} alignItems={'end'} fontSize={'sm'} h="36px">
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
                {`￥${extraDatasetPrice * watchedDatasetSize * datasetMonth}`}
              </Flex>
            </Flex>
          </Box>
          <Button
            mt={6}
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
      </Grid>

      {!!qrPayData && <QRCodePayModal onSuccess={onPaySuccess} {...qrPayData} />}
    </VStack>
  );
};

export default React.memo(ExtraPlan);
