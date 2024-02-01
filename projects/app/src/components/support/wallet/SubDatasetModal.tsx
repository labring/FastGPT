import React, { useState } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Flex,
  ModalBody,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  ModalFooter,
  Button
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  getTeamDatasetValidSub,
  posCheckTeamDatasetSizeSub,
  postUpdateTeamDatasetSizeSub,
  putTeamDatasetSubStatus
} from '@/web/support/wallet/sub/api';
import Markdown from '@/components/Markdown';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MySelect from '@/components/Select';
import {
  SubStatusEnum,
  SubTypeEnum,
  subSelectMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { SubDatasetSizePreviewCheckResponse } from '@fastgpt/global/support/wallet/sub/api.d';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import { useUserStore } from '@/web/support/user/useUserStore';

const SubDatasetModal = ({ onClose }: { onClose: () => void }) => {
  const { subPlans } = useSystemStore();
  const datasetStorePrice = subPlans?.extraDatasetSize?.price || 0;

  const { t } = useTranslation();
  const router = useRouter();
  const { ConfirmModal, openConfirm } = useConfirm({});
  const { userInfo } = useUserStore();
  const [datasetSize, setDatasetSize] = useState(0);
  const [isRenew, setIsRenew] = useState('false');

  const { data: teamSubPlan } = useQuery(['getTeamDatasetValidSub'], getTeamDatasetValidSub, {
    onSuccess(res) {
      setIsRenew(res?.extraDatasetSize?.status === SubStatusEnum.active ? 'true' : 'false');
      setDatasetSize((res?.extraDatasetSize?.nextExtraDatasetSize || 0) / 1000);
    }
  });

  const { mutate: onClickUpdateSub, isLoading: isPaying } = useRequest({
    mutationFn: () => postUpdateTeamDatasetSizeSub({ size: datasetSize }),
    onSuccess() {
      setTimeout(() => {
        router.reload();
      }, 100);
    },
    successToast: t('common.Update success'),
    errorToast: t('common.error.Update error')
  });

  const { mutate: onClickPreviewCheck, isLoading: isFetchingPreviewCheck } = useRequest({
    mutationFn: () =>
      posCheckTeamDatasetSizeSub({
        size: datasetSize
      }),
    onSuccess(res: SubDatasetSizePreviewCheckResponse) {
      if (!res.payForNewSub) {
        onClickUpdateSub('');
        return;
      } else {
        openConfirm(
          () => {
            if (!res.balanceEnough) return;
            onClickUpdateSub('');
          },
          undefined,
          <Box>
            <Flex>
              <Box flex={'0 0 100px'}>当前额外容量:</Box>
              <Box>{teamSubPlan?.extraDatasetSize?.currentExtraDatasetSize || 0}条</Box>
            </Flex>
            <Flex>
              <Box flex={'0 0 100px'}>新的额外容量:</Box>
              <Box>{res.newSubSize}条</Box>
            </Flex>
            <Flex>
              <Box flex={'0 0 100px'}>新套餐价格:</Box>
              <Box>{formatStorePrice2Read(res.newPlanPrice)}元</Box>
            </Flex>
            <Flex>
              <Box flex={'0 0 100px'}>本次需支付:</Box>
              <Box>{formatStorePrice2Read(res.payPrice)}元</Box>
            </Flex>
            <Flex>
              <Box flex={'0 0 100px'}>有效时长:</Box>
              <Box>30天</Box>
            </Flex>
            <Flex>
              <Box flex={'0 0 100px'}>账号余额:</Box>
              <Box>{formatStorePrice2Read(userInfo?.team?.balance).toFixed(3)}元</Box>
            </Flex>
            {!res.balanceEnough && (
              <Box mt={1} color={'red.600'}>
                账号余额不足，请先充值余额再购买额外容量。
              </Box>
            )}
          </Box>
        )();
      }
    },
    errorToast: t('common.error.Update error')
  });
  const { mutate: onUpdateStatus } = useRequest({
    mutationFn: (e: 'true' | 'false') => {
      setIsRenew(e);
      return putTeamDatasetSubStatus({
        status: subSelectMap[e],
        type: SubTypeEnum.extraDatasetSize
      });
    },
    successToast: t('common.Update success'),
    errorToast: t('common.error.Update error')
  });

  const isLoading = isPaying || isFetchingPreviewCheck;

  return (
    <MyModal
      isOpen
      iconSrc="/imgs/module/db.png"
      title={t('support.wallet.subscription.Dataset store')}
    >
      <ModalBody>
        <>
          <Flex alignItems={'center'}>
            {t('support.user.Price')}
            <MyTooltip label={t('support.wallet.subscription.Dataset store price tip')}>
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Flex>
          <Markdown
            source={`
| 套餐知识库容量 | ${teamSubPlan?.standardMaxDatasetSize || Infinity}条 |
| --- | --- |
| 额外知识库 | ${datasetStorePrice}元/1000条/月 |
`}
          />
        </>
        <Flex mt={4}>
          <Box flex={'0 0 120px'}>{t('support.wallet.subscription.Current dataset store')}: </Box>
          <Box ml={2} fontWeight={'bold'} flex={1}>
            {teamSubPlan?.extraDatasetSize?.currentExtraDatasetSize || 0}
            {t('core.dataset.data.unit')}
          </Box>
        </Flex>
        {teamSubPlan?.extraDatasetSize?.nextExtraDatasetSize !== undefined && (
          <Flex mt={4}>
            <Box flex={'0 0 120px'}>{t('support.wallet.subscription.Next sub dataset size')}: </Box>
            <Box ml={2} fontWeight={'bold'} flex={1}>
              {teamSubPlan?.extraDatasetSize?.nextExtraDatasetSize || 0}
              {t('core.dataset.data.unit')}
            </Box>
          </Flex>
        )}
        {!!teamSubPlan?.extraDatasetSize?.startTime && (
          <Flex mt={3}>
            <Box flex={'0 0 120px'}>订阅开始时间: </Box>
            <Box ml={2}>{formatTime2YMDHM(teamSubPlan?.extraDatasetSize?.startTime)}</Box>
          </Flex>
        )}
        {!!teamSubPlan?.extraDatasetSize?.expiredTime && (
          <Flex mt={3}>
            <Box flex={'0 0 120px'}>订阅到期时间: </Box>
            <Box ml={2}>{formatTime2YMDHM(teamSubPlan?.extraDatasetSize?.expiredTime)}</Box>
          </Flex>
        )}
        <Flex mt={3} alignItems={'center'}>
          <Box flex={'0 0 120px'}>是否自动续费: </Box>
          <MySelect
            ml={2}
            value={isRenew}
            size={'sm'}
            w={'150px'}
            list={[
              { label: '自动续费', value: 'true' },
              { label: '不自动续费', value: 'false' }
            ]}
            onchange={onUpdateStatus}
          />
        </Flex>
        <Box mt={4}>
          <Box>{t('support.wallet.subscription.Update extra dataset size')}</Box>
          <Flex alignItems={'center'} mt={1}>
            <NumberInput
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
              <NumberInputField value={datasetSize} step={1} min={0} max={10000} />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
            <Box ml={2}>000{t('core.dataset.data.unit')}</Box>
          </Flex>
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common.Close')}
        </Button>
        {datasetSize * 1000 !== teamSubPlan?.extraDatasetSize?.nextExtraDatasetSize && (
          <Button ml={3} isLoading={isLoading} onClick={onClickPreviewCheck}>
            {t('common.Confirm')}
          </Button>
        )}
      </ModalFooter>

      <ConfirmModal />
    </MyModal>
  );
};

export default SubDatasetModal;
