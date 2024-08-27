import React, { useMemo } from 'react';
import {
  ModalBody,
  ModalFooter,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  ModalCloseButton,
  HStack,
  Box,
  Flex
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getTeamPlans } from '@/web/support/user/team/api';
import {
  subTypeMap,
  standardSubLevelMap,
  SubTypeEnum
} from '@fastgpt/global/support/wallet/sub/constants';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

type packageStatus = 'active' | 'inactive' | 'expired';

const StandDetailModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const { subPlans } = useSystemStore();
  const { data: teamPlans = [], loading: isLoading } = useRequest2(
    () =>
      getTeamPlans().then((res) => {
        return [
          ...res.filter((plan) => plan.type === SubTypeEnum.standard),
          ...res.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize),
          ...res.filter((plan) => plan.type === SubTypeEnum.extraPoints)
        ].map((item, index) => {
          return {
            ...item,
            status:
              new Date(item.expiredTime).getTime() < new Date().getTime()
                ? 'expired'
                : item.type === SubTypeEnum.standard
                  ? index === 0
                    ? 'active'
                    : 'inactive'
                  : 'active'
          };
        });
      }),
    {
      manual: false
    }
  );

  return (
    <MyModal
      isOpen
      maxW={['90vw', '1200px']}
      iconSrc="modal/teamPlans"
      title={t('common:support.wallet.Standard Plan Detail')}
      isCentered
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody px={[4, 8]} py={[2, 6]}>
        <TableContainer mt={2} position={'relative'} minH={'300px'}>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('common:support.standard.type')}</Th>
                <Th>{t('common:support.standard.storage')}</Th>
                <Th>{t('common:support.standard.AI Bonus Points')}</Th>
                <Th>{t('user:bill.valid_time')}</Th>
                <Th>{t('common:support.standard.due_date')}</Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {teamPlans.map(
                ({
                  _id,
                  type,
                  currentSubLevel,
                  currentExtraDatasetSize,
                  surplusPoints = 0,
                  totalPoints = 0,
                  startTime,
                  expiredTime,
                  status
                }) => {
                  const standardPlan = currentSubLevel
                    ? subPlans?.standard?.[currentSubLevel]
                    : undefined;
                  const datasetSize = standardPlan?.maxDatasetSize || currentExtraDatasetSize;

                  return (
                    <Tr key={_id} fontWeight={500} fontSize={'mini'} color={'myGray.900'}>
                      <Td>
                        <Flex>
                          <Flex align={'center'}>
                            <MyIcon
                              mr={2}
                              name={subTypeMap[type]?.icon as any}
                              w={'20px'}
                              h={'20px'}
                              color={'myGray.600'}
                              fontWeight={500}
                            />
                          </Flex>
                          <Flex align={'center'} color={'myGray.900'}>
                            {t(subTypeMap[type]?.label as any)}
                            {currentSubLevel &&
                              `(${t(standardSubLevelMap[currentSubLevel]?.label as any)})`}
                          </Flex>
                          <StatusTag status={status as packageStatus} />
                        </Flex>
                      </Td>
                      <Td>
                        {datasetSize ? `${datasetSize + t('common:core.dataset.data.group')}` : '-'}
                      </Td>
                      <Td>
                        {totalPoints
                          ? `${Math.round(totalPoints - surplusPoints)} / ${totalPoints} ${t('common:support.wallet.subscription.point')}`
                          : '-'}
                      </Td>
                      <Td color={'myGray.600'}>{formatTime2YMDHM(startTime)}</Td>
                      <Td color={'myGray.600'}>{formatTime2YMDHM(expiredTime)}</Td>
                    </Tr>
                  );
                }
              )}
              <Tr key={'_id'}></Tr>
            </Tbody>
          </Table>
          <Loading loading={isLoading} fixed={false} />
        </TableContainer>
        <HStack mt={4} color={'primary.700'}>
          <MyIcon name={'infoRounded'} w={'1rem'} />
          <Box fontSize={'mini'} fontWeight={'500'}>
            {t('user:bill.standard_valid_tip')}
          </Box>
        </HStack>
      </ModalBody>
    </MyModal>
  );
};

function StatusTag({ status }: { status: packageStatus }) {
  const { t } = useTranslation();
  const statusText = useMemo(() => {
    return {
      inactive: t('common:support.wallet.subscription.status.inactive'),
      active: t('common:support.wallet.subscription.status.active'),
      expired: t('common:support.wallet.subscription.status.expired')
    };
  }, [t]);
  const styleMap = useMemo(() => {
    return {
      inactive: {
        color: 'adora.600',
        bg: 'adora.50'
      },
      active: {
        color: 'green.600',
        bg: 'green.50'
      },
      expired: {
        color: 'myGray.700',
        bg: 'myGray.100'
      }
    };
  }, []);
  return (
    <Box
      py={'0.25rem'}
      ml={'0.375rem'}
      px={'0.5rem'}
      fontSize={'0.625rem'}
      fontWeight={500}
      borderRadius={'sm'}
      bg={styleMap[status]?.bg}
      color={styleMap[status]?.color}
    >
      {statusText[status]}
    </Box>
  );
}

export default StandDetailModal;
