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

  const getDurationText = (duration: number) => {
    if (duration < 12) return `${duration} ${t('common:month_text')}`;
    return t('common:one_year');
  };

  const { runAsync: onclickBuyExtraPoints, loading: isLoadingBuyExtraPoints } = useRequest2(
    async ({ points, duration }: { points: number; duration: number }) => {
      points = Math.ceil(points);
      duration = Math.ceil(duration);

      const res = await postCreatePayBill({
        type: BillTypeEnum.extraPoints,
        extraPoints: points,
        duration: duration
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

  return (
    <VStack>
      <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={5} w={['100%', 'auto']}>
        <Box
          bg={'white'}
          w={['100%', '582px']}
          px={8}
          py={6}
          borderRadius={'16px'}
          borderWidth={'1px'}
          borderColor={'myGray.200'}
          boxShadow={'0 1px 2px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.15)'}
        >
          <Box
            fontSize={'18px'}
            fontWeight={'500'}
            color={'primary.700'}
            pb={6}
            borderBottomWidth={'1px'}
            borderBottomColor={'myGray.200'}
          >
            {t('common:support.wallet.subscription.Extra ai points')}
          </Box>
          <Grid gridTemplateColumns={'repeat(3, 1fr)'} gap={3} py={4} minHeight={'220px'}>
            {extraPointsPackages.map((pkg, index) => (
              <Flex
                key={index}
                flexDir={'column'}
                alignItems={'center'}
                justifyContent={'center'}
                p={4}
                borderRadius={'sm'}
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
              >
                <Box fontSize={'24px'} fontWeight={'medium'} color={'myGray.600'}>
                  {formatNumberWithUnit(pkg.points, i18n.language)}{' '}
                  {t('common:support.wallet.subscription.point')}
                </Box>
                <Box fontSize={'12px'} fontWeight={'medium'} color={'myGray.500'} mt={2}>
                  {t('common:invalid_time') + ' '}
                  {getDurationText(pkg.duration)}
                </Box>
              </Flex>
            ))}
          </Grid>

          <Flex justifyContent={'space-between'} alignItems={'center'}>
            <Box fontSize={'14px'} color={'myGray.600'} fontWeight={'medium'}>
              {t('common:support.wallet.subscription.Update extra price')}
            </Box>
            <Box color={'myGray.600'} fontSize={'20px'} fontWeight={'medium'}>
              {selectedPackageIndex !== undefined && extraPointsPackages[selectedPackageIndex]
                ? t('common:extraPointsPrice', {
                    price: extraPointsPackages[selectedPackageIndex].price
                  })
                : '--'}
            </Box>
          </Flex>

          <Button
            w={'100%'}
            h={'44px'}
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
                  duration: selectedPackage.duration
                });
              }
            }}
            fontSize={'16px'}
            color={'primary.700'}
            mt={4}
          >
            {t('common:support.wallet.Buy')}
          </Button>

          <HStack color={'blue.700'} mt={6}>
            <MyIcon name={'infoRounded'} w={'18px'} />
            <Box fontSize={'14px'} fontWeight={'medium'}>
              {t('common:support.wallet.subscription.Update extra ai points tips')}
            </Box>
          </HStack>
        </Box>

        {/* dataset */}
        <Flex
          bg={'white'}
          w={['100%', '582px']}
          px={8}
          py={6}
          borderRadius={'16px'}
          borderColor={'myGray.200'}
          boxShadow={'0 1px 2px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.15)'}
          flexDir="column"
          borderWidth={'1px'}
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
