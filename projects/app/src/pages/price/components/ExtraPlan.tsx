import {
  Box,
  Flex,
  Grid,
  NumberDecrementStepper,
  NumberInput,
  NumberIncrementStepper,
  NumberInputField,
  NumberInputStepper,
  Button,
  useDisclosure,
  ModalBody,
  ModalFooter
} from '@chakra-ui/react';
import { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useState } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MySelect from '@/components/Select';
import {
  SubStatusEnum,
  SubTypeEnum,
  subSelectMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { useRequest } from '@/web/common/hooks/useRequest';
import {
  posCheckTeamDatasetSizeSub,
  postUpdateTeamDatasetSizeSub,
  putTeamDatasetSubStatus
} from '@/web/support/wallet/sub/api';
import { SubDatasetSizePreviewCheckResponse } from '@fastgpt/global/support/wallet/sub/api.d';
import { useRouter } from 'next/router';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyModal from '@/components/MyModal';

const ExtraPlan = ({
  extraDatasetSize,
  extraPoints
}: {
  extraDatasetSize?: TeamSubSchema;
  extraPoints?: TeamSubSchema;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { subPlans } = useSystemStore();

  // extra dataset
  const extraDatasetPrice = subPlans?.extraDatasetSize?.price || 0;
  const [confirmPayExtraDatasetSizeData, setConfirmPayExtraDatasetSizeData] =
    useState<SubDatasetSizePreviewCheckResponse>();
  const [datasetSize, setDatasetSize] = useState(0);
  const { mutate: onClickUpdateExtraDatasetPlan, isLoading: isPayingExtraDatasetSize } = useRequest(
    {
      mutationFn: () => postUpdateTeamDatasetSizeSub({ size: datasetSize }),
      onSuccess() {
        setTimeout(() => {
          router.reload();
        }, 100);
      },
      successToast: t('common.Update success'),
      errorToast: t('common.error.Update error')
    }
  );
  const { mutate: onClickPreviewCheck, isLoading: isFetchingPreviewCheck } = useRequest({
    mutationFn: () =>
      posCheckTeamDatasetSizeSub({
        size: datasetSize
      }),
    onSuccess(res: SubDatasetSizePreviewCheckResponse) {
      if (!res.payForNewSub) {
        onClickUpdateExtraDatasetPlan('');
        return;
      } else {
        setConfirmPayExtraDatasetSizeData(res);
      }
    },
    errorToast: t('common.error.Update error')
  });
  useEffect(() => {
    setDatasetSize((extraDatasetSize?.nextExtraDatasetSize || 0) / 1000);
  }, [extraDatasetSize]);

  // extra ai points
  const [extraPointsAmount, setExtraPointsAmount] = useState(0);

  const { userInfo } = useUserStore();

  const formatPoints = (points: number = 0) => {
    if (points === 0) return 0;
    return `${points / 10000}万`;
  };

  return (
    <Flex
      mt={['40px', '90px']}
      flexDirection={'column'}
      alignItems={'center'}
      position={'relative'}
    >
      <Box fontWeight={'bold'} fontSize={['24px', '36px']}>
        {t('support.wallet.subscription.Extra plan')}
      </Box>
      <Box mt={8} mb={10} color={'myGray.500'} fontSize={'lg'}>
        {t('support.wallet.subscription.Extra plan tip')}
      </Box>
      <Grid mt={8} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
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
              <Box fontSize={'xl'} color={'primary.600'}>
                {t('support.wallet.subscription.Extra dataset size')}
              </Box>
              <Box mt={3} fontSize={['32px', '38px']} fontWeight={'bold'}>
                ￥{extraDatasetPrice}/1k组{' '}
                <Box ml={1} as={'span'} fontSize={'lg'} color={'myGray.600'} fontWeight={'normal'}>
                  /{t('common.month')}
                </Box>
              </Box>
            </Box>
            <MyIcon
              transform={'translate(20px,-20px)'}
              name={'support/bill/extraDatasetsize'}
              fill={'none'}
            />
          </Flex>
          <Box>
            <Flex mt={4}>
              <Box flex={'0 0 200px'}>
                {t('support.wallet.subscription.Current dataset store')}:{' '}
              </Box>
              <Box fontWeight={'bold'} flex={1}>
                {extraDatasetSize?.currentExtraDatasetSize || 0}
                {t('core.dataset.data.unit')}
              </Box>
            </Flex>
            <Flex mt={4}>
              <Box flex={'0 0 200px'}>
                {t('support.wallet.subscription.Next sub dataset size')}:
              </Box>
              <Box fontWeight={'bold'} flex={1}>
                {extraDatasetSize?.nextExtraDatasetSize || 0}
                {t('core.dataset.data.unit')}
              </Box>
            </Flex>
            <Flex mt={3}>
              <Box flex={'0 0 200px'}>订阅开始时间: </Box>
              <Box>
                {extraDatasetSize?.startTime ? formatTime2YMDHM(extraDatasetSize.startTime) : '-'}
              </Box>
            </Flex>
            <Flex mt={3}>
              <Box flex={'0 0 200px'}>订阅到期时间: </Box>
              <Box>
                {extraDatasetSize?.expiredTime
                  ? formatTime2YMDHM(extraDatasetSize.expiredTime)
                  : '-'}
              </Box>
            </Flex>
            <Flex mt={4} alignItems={'center'}>
              <Box flex={'0 0 200px'}>
                {t('support.wallet.subscription.Update extra dataset size')}
              </Box>
              <Flex alignItems={'center'} mt={1} w={'180px'} position={'relative'}>
                <NumberInput
                  size={'sm'}
                  flex={1}
                  min={0}
                  max={10000}
                  step={1}
                  value={datasetSize}
                  position={'relative'}
                  onChange={(e) => {
                    setDatasetSize(Number(e));
                  }}
                >
                  <NumberInputField pr={'30px'} value={datasetSize} step={1} min={0} max={10000} />
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
            <Button
              isDisabled={datasetSize * 1000 === extraDatasetSize?.nextExtraDatasetSize}
              mt={6}
              w={'100%'}
              variant={'primaryGhost'}
              isLoading={isPayingExtraDatasetSize || isFetchingPreviewCheck}
              onClick={onClickPreviewCheck}
            >
              {t('common.change')}
            </Button>
          </Box>
        </Box>
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
              <Box fontSize={'xl'} color={'primary.600'}>
                {t('support.wallet.subscription.Extra ai points')}
              </Box>
              <Box mt={3} fontSize={['32px', '38px']} fontWeight={'bold'}>
                ￥{3}/10万积分{' '}
                <Box ml={1} as={'span'} fontSize={'lg'} color={'myGray.600'} fontWeight={'normal'}>
                  /{t('common.month')}
                </Box>
              </Box>
            </Box>
            <MyIcon
              transform={'translate(20px,-20px)'}
              name={'support/bill/extraPoints'}
              fill={'none'}
            />
          </Flex>
          <Box>
            <Flex mt={4}>
              <Box flex={'0 0 200px'}>
                {t('support.wallet.subscription.Current extra ai points')}:
              </Box>
              <Box fontWeight={'bold'} flex={1}>
                {formatPoints(extraPoints?.currentExtraPoints)}
              </Box>
            </Flex>
            <Flex mt={4}>
              <Box flex={'0 0 200px'}>{t('support.wallet.subscription.Next extra ai points')}:</Box>
              <Box fontWeight={'bold'} flex={1}>
                {formatPoints(extraPoints?.nextExtraPoints || 0)}
              </Box>
            </Flex>
            <Flex mt={3}>
              <Box flex={'0 0 200px'}>订阅开始时间: </Box>
              <Box>{extraPoints?.startTime ? formatTime2YMDHM(extraPoints.startTime) : '-'}</Box>
            </Flex>
            <Flex mt={3}>
              <Box flex={'0 0 200px'}>订阅到期时间: </Box>
              <Box>
                {extraPoints?.expiredTime ? formatTime2YMDHM(extraPoints.expiredTime) : '-'}
              </Box>
            </Flex>
            <Flex mt={4} alignItems={'center'}>
              <Box flex={'0 0 200px'}>
                {t('support.wallet.subscription.Update extra ai points')}
              </Box>
              <Flex alignItems={'center'} mt={1} w={'180px'} position={'relative'}>
                <NumberInput
                  size={'sm'}
                  flex={1}
                  min={0}
                  max={10000}
                  step={1}
                  value={extraPointsAmount}
                  position={'relative'}
                  onChange={(e) => {
                    setExtraPointsAmount(Number(e));
                  }}
                >
                  <NumberInputField
                    pr={'30px'}
                    value={extraPointsAmount}
                    step={1}
                    min={0}
                    max={10000}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <Box position={'absolute'} right={'20px'} color={'myGray.500'} fontSize={'xs'}>
                  0万
                </Box>
              </Flex>
            </Flex>
            <Button
              isDisabled={extraPointsAmount * 100000 === extraPoints?.nextExtraPoints}
              mt={6}
              w={'100%'}
              variant={'primaryGhost'}
              isLoading={isPayingExtraDatasetSize || isFetchingPreviewCheck}
            >
              {t('common.change')}
            </Button>
          </Box>
        </Box>
      </Grid>

      {/* extra dataset size modal */}
      {!!confirmPayExtraDatasetSizeData && (
        <MyModal
          isOpen
          onClose={() => setConfirmPayExtraDatasetSizeData(undefined)}
          title={t('support.wallet.Confirm pay')}
          iconSrc="common/confirm/rightTip"
        >
          <ModalBody px={8} py={5}>
            <Flex>
              <Box flex={'0 0 120px'} color={'myGray.600'}>
                当前额外容量
              </Box>
              <Box>{extraDatasetSize?.currentExtraDatasetSize || 0}条</Box>
            </Flex>
            <Flex mt={4}>
              <Box flex={'0 0 120px'} color={'myGray.600'}>
                新的额外容量
              </Box>
              <Box>{confirmPayExtraDatasetSizeData.newSubSize}条</Box>
            </Flex>
            <Flex mt={4}>
              <Box flex={'0 0 120px'} color={'myGray.600'}>
                新套餐价格
              </Box>
              <Box>{formatStorePrice2Read(confirmPayExtraDatasetSizeData.newPlanPrice)}元</Box>
            </Flex>
            <Flex mt={4}>
              <Box flex={'0 0 120px'} color={'myGray.600'}>
                有效时长
              </Box>
              <Box>30天</Box>
            </Flex>
          </ModalBody>
          <ModalFooter mx={8} px={0} borderTopWidth={'1px'} borderTopColor={'myGray.200'}>
            <Box color={'myGray.600'}>账号余额：</Box>
            {confirmPayExtraDatasetSizeData.balanceEnough ? (
              <>
                <Box flex={'1 0 0'}>
                  {formatStorePrice2Read(userInfo?.team?.balance).toFixed(2)}元
                </Box>
                <Button
                  isLoading={isPayingExtraDatasetSize}
                  onClick={() => onClickUpdateExtraDatasetPlan('')}
                >
                  支付{formatStorePrice2Read(confirmPayExtraDatasetSizeData.payPrice).toFixed(2)}元
                </Button>
              </>
            ) : (
              <>
                <Box color={'red.600'} flex={'1 0 0'}>
                  余额不足
                </Box>
                <Button
                  isLoading={isPayingExtraDatasetSize}
                  onClick={() => router.push('/account')}
                >
                  去充值
                </Button>
              </>
            )}
          </ModalFooter>
        </MyModal>
      )}
    </Flex>
  );
};

export default React.memo(ExtraPlan);
