import {
  Box,
  Flex,
  Grid,
  NumberDecrementStepper,
  NumberInput,
  NumberIncrementStepper,
  NumberInputField,
  NumberInputStepper,
  Button
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useState } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getWxPayQRCode } from '@/web/support/wallet/bill/api';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';

const ExtraPlan = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { subPlans } = useSystemStore();
  const [loading, setLoading] = useState(false);
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  // extra dataset
  const extraDatasetPrice = subPlans?.extraDatasetSize?.price || 0;
  const { register: registerDatasetSize, handleSubmit: handleSubmitDatasetSize } = useForm({
    defaultValues: {
      datasetSize: 0,
      month: 1
    }
  });
  const onclickBuyDatasetSize = useCallback(
    async ({ datasetSize, month }: { datasetSize: number; month: number }) => {
      try {
        datasetSize = Math.ceil(datasetSize);
        month = Math.ceil(month);

        const datasetSizePayAmount = datasetSize * month * extraDatasetPrice;
        if (datasetSizePayAmount === 0) {
          return toast({
            status: 'warning',
            title: '购买数量不能为0'
          });
        }
        setLoading(true);

        const res = await getWxPayQRCode({
          type: BillTypeEnum.extraDatasetSub,
          month,
          extraDatasetSize: datasetSize
        });
        setQRPayData({
          readPrice: res.readPrice,
          codeUrl: res.codeUrl,
          billId: res.billId
        });
      } catch (err) {
        toast({
          title: getErrText(err),
          status: 'error'
        });
      }
      setLoading(false);
    },
    [extraDatasetPrice, toast]
  );

  // extra ai points
  const extraPointsPrice = subPlans?.extraPoints?.price || 0;
  const { register: registerExtraPoints, handleSubmit: handleSubmitExtraPoints } = useForm({
    defaultValues: {
      points: 0,
      month: 1
    }
  });
  const onclickBuyExtraPoints = useCallback(
    async ({ points }: { points: number }) => {
      try {
        points = Math.ceil(points);

        const month = 1;
        const payAmount = points * month * extraPointsPrice;

        if (payAmount === 0) {
          return toast({
            status: 'warning',
            title: '购买数量不能为0'
          });
        }
        setLoading(true);

        const res = await getWxPayQRCode({
          type: BillTypeEnum.extraPoints,
          extraPoints: points
        });

        setQRPayData({
          readPrice: res.readPrice,
          codeUrl: res.codeUrl,
          billId: res.billId
        });
      } catch (err) {
        toast({
          title: getErrText(err),
          status: 'error'
        });
      }
      setLoading(false);
    },
    [extraPointsPrice, toast]
  );

  return (
    <Flex
      mt={['40px', '90px']}
      flexDirection={'column'}
      alignItems={'center'}
      position={'relative'}
    >
      <Box id={'extra-plan'} fontWeight={'bold'} fontSize={['24px', '36px']}>
        {t('support.wallet.subscription.Extra plan')}
      </Box>
      <Box mt={8} mb={10} color={'myGray.500'} fontSize={'md'}>
        {t('support.wallet.subscription.Extra plan tip')}
      </Box>
      <Grid mt={8} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5} w={['100%', 'auto']}>
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
          <Flex borderBottomWidth={'1px'} borderBottomColor={'myGray.200'}>
            <Box flex={'1 0 0'}>
              <Box fontSize={'lg'} color={'primary.600'}>
                {t('support.wallet.subscription.Extra dataset size')}
              </Box>
              <Box mt={3} fontSize={['28px', '32px']} fontWeight={'bold'}>
                ￥{extraDatasetPrice}/1000组{' '}
                <Box ml={1} as={'span'} fontSize={'md'} color={'myGray.600'} fontWeight={'normal'}>
                  /{t('common.month')}
                </Box>
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
          <Box h={'120px'} w={'100%'}>
            <Flex mt={4}>
              <MyIcon mr={2} name={'support/bill/shoppingCart'} w={'16px'} color={'primary.600'} />
              购买资源包
            </Flex>
            <Flex mt={4} alignItems={'center'}>
              <Box flex={['0 0 100px', '1 0 0']}>
                {t('support.wallet.subscription.Month amount')}
              </Box>
              <Flex alignItems={'center'} mt={1} w={'180px'} position={'relative'}>
                <NumberInput size={'sm'} flex={1} step={1} min={1} max={12} position={'relative'}>
                  <NumberInputField
                    pr={'30px'}
                    {...registerDatasetSize('month', {
                      required: true,
                      min: 1,
                      max: 12,
                      valueAsNumber: true
                    })}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <Box position={'absolute'} right={'20px'} color={'myGray.500'} fontSize={'xs'}>
                  {t('common.month')}
                </Box>
              </Flex>
            </Flex>
            <Flex mt={4} alignItems={'center'}>
              <Box flex={['0 0 100px', '1 0 0']}>
                {t('support.wallet.subscription.Update extra dataset size')}
              </Box>
              <Flex alignItems={'center'} mt={1} w={'180px'} position={'relative'}>
                <NumberInput
                  size={'sm'}
                  flex={1}
                  min={0}
                  max={10000}
                  step={1}
                  position={'relative'}
                >
                  <NumberInputField
                    pr={'30px'}
                    {...registerDatasetSize('datasetSize', {
                      required: true,
                      min: 0,
                      max: 10000,
                      valueAsNumber: true
                    })}
                    step={1}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <Box position={'absolute'} right={'20px'} color={'myGray.500'} fontSize={'xs'}>
                  000{t('core.dataset.data.unit')}
                </Box>
              </Flex>
            </Flex>
          </Box>
          <Button
            mt={6}
            w={'100%'}
            variant={'primaryGhost'}
            isLoading={loading}
            onClick={handleSubmitDatasetSize(onclickBuyDatasetSize)}
          >
            {t('support.wallet.Buy')}
          </Button>
        </Box>
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
          <Flex borderBottomWidth={'1px'} borderBottomColor={'myGray.200'}>
            <Box flex={'1 0 0'}>
              <Box fontSize={'lg'} color={'primary.600'}>
                {t('support.wallet.subscription.Extra ai points')}
              </Box>
              <Box mt={3} fontSize={['28px', '32px']} fontWeight={'bold'}>
                ￥{extraPointsPrice}/1000积分{' '}
                <Box ml={1} as={'span'} fontSize={'md'} color={'myGray.600'} fontWeight={'normal'}>
                  /{t('common.month')}
                </Box>
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
          <Box h={'120px'} w={'100%'}>
            <Flex mt={4}>
              <MyIcon mr={2} name={'support/bill/shoppingCart'} w={'16px'} color={'primary.600'} />
              购买资源包
            </Flex>
            {/* <Flex mt={4} alignItems={'center'}>
              <Box flex={['0 0 100px', '1 0 0']}>
                {t('support.wallet.subscription.Month amount')}
              </Box>
              <Flex alignItems={'center'} mt={1} w={'180px'} position={'relative'}>
                <NumberInput size={'sm'} flex={1} step={1} min={1} max={12} position={'relative'}>
                  <NumberInputField
                    pr={'30px'}
                    {...registerExtraPoints('month', {
                      required: true,
                      min: 1,
                      max: 12,
                      valueAsNumber: true
                    })}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <Box position={'absolute'} right={'20px'} color={'myGray.500'} fontSize={'xs'}>
                  {t('common.month')}
                </Box>
              </Flex>
            </Flex> */}
            <Flex mt={4} alignItems={'center'}>
              <Box flex={['0 0 100px', '1 0 0']}>
                {t('support.wallet.subscription.Update extra ai points')}
              </Box>
              <Flex alignItems={'center'} mt={1} w={'180px'} position={'relative'}>
                <NumberInput
                  size={'sm'}
                  flex={1}
                  min={0}
                  max={10000}
                  step={1}
                  position={'relative'}
                >
                  <NumberInputField
                    pr={'30px'}
                    step={1}
                    {...registerExtraPoints('points', {
                      required: true,
                      min: 0,
                      max: 10000,
                      valueAsNumber: true
                    })}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <Box position={'absolute'} right={'20px'} color={'myGray.500'} fontSize={'xs'}>
                  000积分
                </Box>
              </Flex>
            </Flex>
          </Box>
          <Button
            mt={6}
            w={'100%'}
            variant={'primaryGhost'}
            isLoading={loading}
            onClick={handleSubmitExtraPoints(onclickBuyExtraPoints)}
          >
            {t('support.wallet.Buy')}
          </Button>
        </Box>
      </Grid>

      {!!qrPayData && <QRCodePayModal {...qrPayData} />}
    </Flex>
  );
};

export default React.memo(ExtraPlan);
