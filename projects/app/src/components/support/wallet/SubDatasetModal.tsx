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
import { getTeamDatasetValidSub, postExpandTeamDatasetSub } from '@/web/support/wallet/sub/api';
import Markdown from '@/components/Markdown';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { getMonthRemainingDays } from '@fastgpt/global/common/math/date';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useRouter } from 'next/router';
import { feConfigs } from '@/web/common/system/staticData';
import { useToast } from '@/web/common/hooks/useToast';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MySelect from '@/components/Select';

const SubDatasetModal = ({ onClose }: { onClose: () => void }) => {
  const datasetStoreFreeSize = feConfigs?.subscription?.datasetStoreFreeSize || 0;
  const datasetStorePrice = feConfigs?.subscription?.datasetStorePrice || 0;

  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { ConfirmModal, openConfirm } = useConfirm({});
  const [datasetSize, setDatasetSize] = useState(0);
  const [isRenew, setIsRenew] = useState('false');

  const isExpand = datasetSize > 0;

  const { data: datasetSub } = useQuery(['getTeamDatasetValidSub'], getTeamDatasetValidSub, {
    onSuccess(res) {
      setIsRenew(`${res?.sub?.renew}`);
    }
  });

  const { mutate, isLoading } = useRequest({
    mutationFn: () => postExpandTeamDatasetSub({ size: datasetSize, renew: isRenew === 'true' }),
    onSuccess(res) {
      if (isExpand) {
        router.reload();
      } else {
        onClose();
      }
    },
    successToast: isExpand ? t('support.wallet.Pay success') : t('common.Update success'),
    errorToast: isExpand ? t('support.wallet.Pay error') : t('common.error.Update error')
  });

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
| 免费知识库 | ${datasetStoreFreeSize}条 |
| --- | --- |
| 额外知识库 | ${datasetStorePrice}元/1000条/月 |
`}
          />
        </>
        <Flex mt={4}>
          <Box w={'100px'}>{t('support.wallet.subscription.Current dataset store')}: </Box>
          <Box ml={2} fontWeight={'bold'} flex={1}>
            {datasetSub?.sub?.datasetStoreAmount || 0}
            {t('core.dataset.data.unit')}
          </Box>
        </Flex>
        {datasetSub?.sub?.expiredTime && (
          <Flex mt={3}>
            <Box w={'100px'}>到期时间: </Box>
            <Box ml={2}>{formatTime2YMDHM(datasetSub?.sub?.expiredTime)}</Box>
          </Flex>
        )}

        <Flex mt={3} alignItems={'center'}>
          <Box w={'100px'}>是否续订: </Box>
          <MySelect
            ml={2}
            value={isRenew}
            size={'sm'}
            w={'150px'}
            list={[
              { label: '自动续费', value: 'true' },
              { label: '不自动续费', value: 'false' }
            ]}
            onchange={setIsRenew}
          />
        </Flex>
        <Box mt={4}>
          <Box>{t('support.wallet.subscription.Expand size')}</Box>
          <Flex alignItems={'center'} mt={1}>
            <NumberInput
              flex={1}
              min={0}
              step={1}
              value={datasetSize}
              position={'relative'}
              onChange={(e) => {
                setDatasetSize(Number(e));
              }}
            >
              <NumberInputField value={datasetSize} step={1} min={0} />
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
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          isLoading={isLoading}
          onClick={() => {
            if (isExpand) {
              const currentMonthPrice = (
                datasetSize *
                datasetStorePrice *
                (getMonthRemainingDays() / 30)
              ).toFixed(2);
              const totalSize = (datasetSub?.sub?.datasetStoreAmount || 0) / 1000 + datasetSize;
              openConfirm(
                mutate,
                undefined,
                `本次扩容预估扣除 ${currentMonthPrice} 元。次月起，每月 1 号将会扣除 ${
                  totalSize * datasetStorePrice
                } 元(共${totalSize * 1000}条)。请确保账号余额充足。`
              )();
            } else {
              mutate('');
            }
          }}
        >
          {t('common.Confirm')}
        </Button>
      </ModalFooter>

      <ConfirmModal />
    </MyModal>
  );
};

export default SubDatasetModal;
