import React from 'react';
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
  ModalCloseButton
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getTeamPlans } from '@/web/support/user/team/api';
import { subTypeMap, standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { useSystemStore } from '@/web/common/system/useSystemStore';
const StandDetailModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const { subPlans } = useSystemStore();
  const { data: teamPlans = [], isLoading } = useQuery(['getTeamPlans'], getTeamPlans);

  return (
    <MyModal
      isOpen
      maxW={['90vw', '1200px']}
      iconSrc="modal/teamPlans"
      title={t('support.wallet.Standard Plan Detail')}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody>
        <TableContainer mt={2} position={'relative'} minH={'300px'}>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('support.standard.type')}</Th>
                <Th>{t('support.standard.storage')}</Th>
                <Th>{t('support.standard.AI Bonus Points')}</Th>
                <Th>{t('support.standard.Start Time')}</Th>
                <Th>{t('support.standard.Expired Time')}</Th>
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
                  expiredTime
                }: TeamSubSchema) => {
                  const standardPlan = currentSubLevel
                    ? subPlans?.standard?.[currentSubLevel]
                    : undefined;
                  const datasetSize = standardPlan?.maxDatasetSize || currentExtraDatasetSize;

                  return (
                    <Tr key={_id}>
                      <Td>
                        <MyIcon
                          mr={2}
                          name={subTypeMap[type]?.icon as any}
                          w={'20px'}
                          color={'myGray.800'}
                        />
                        {t(subTypeMap[type]?.label)}
                        {currentSubLevel && `(${t(standardSubLevelMap[currentSubLevel]?.label)})`}
                      </Td>
                      <Td>{datasetSize ? `${datasetSize}组` : '-'}</Td>
                      <Td>
                        {totalPoints
                          ? `${Math.round(totalPoints - surplusPoints)} / ${totalPoints} 积分`
                          : '-'}
                      </Td>
                      <Td>{formatTime2YMDHM(startTime)}</Td>
                      <Td>{formatTime2YMDHM(expiredTime)}</Td>
                    </Tr>
                  );
                }
              )}
              <Tr key={'_id'}></Tr>
            </Tbody>
          </Table>
          <Loading loading={isLoading} fixed={false} />
        </TableContainer>
      </ModalBody>
      <ModalFooter></ModalFooter>
    </MyModal>
  );
};

export default StandDetailModal;
