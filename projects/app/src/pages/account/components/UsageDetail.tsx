import React, { useMemo } from 'react';
import {
  ModalBody,
  Flex,
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer
} from '@chakra-ui/react';
import { UsageItemType } from '@fastgpt/global/support/wallet/usage/type.d';
import dayjs from 'dayjs';
import { UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const UsageDetail = ({ usage, onClose }: { usage: UsageItemType; onClose: () => void }) => {
  const { t } = useTranslation();
  const filterBillList = useMemo(
    () => usage.list.filter((item) => item && item.moduleName),
    [usage.list]
  );

  const { hasModel, hasToken, hasCharsLen, hasDuration } = useMemo(() => {
    let hasModel = false;
    let hasToken = false;
    let hasCharsLen = false;
    let hasDuration = false;
    let hasDataLen = false;

    usage.list.forEach((item) => {
      if (item.model !== undefined) {
        hasModel = true;
      }

      if (typeof item.tokens === 'number') {
        hasToken = true;
      }
      if (typeof item.charsLength === 'number') {
        hasCharsLen = true;
      }
      if (typeof item.duration === 'number') {
        hasDuration = true;
      }
    });

    return {
      hasModel,
      hasToken,
      hasCharsLen,
      hasDuration,
      hasDataLen
    };
  }, [usage.list]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/bill.svg"
      title={t('common:support.wallet.usage.Usage Detail')}
      maxW={['90vw', '700px']}
    >
      <ModalBody>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('common:support.wallet.bill.Number')}:</FormLabel>
          <Box>{usage.id}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('common:support.wallet.usage.Time')}:</FormLabel>
          <Box>{dayjs(usage.time).format('YYYY/MM/DD HH:mm:ss')}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('common:support.wallet.usage.App name')}:</FormLabel>
          <Box>{t(usage.appName as any) || '-'}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('common:support.wallet.usage.Source')}:</FormLabel>
          <Box>{t(UsageSourceMap[usage.source]?.label as any)}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('common:support.wallet.usage.Total points')}:</FormLabel>
          <Box fontWeight={'bold'}>{formatNumber(usage.totalPoints)}</Box>
        </Flex>
        <Box pb={4}>
          <FormLabel flex={'0 0 80px'} mb={1}>
            {t('common:support.wallet.usage.Bill Module')}
          </FormLabel>
          <TableContainer fontSize={'sm'}>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('common:support.wallet.usage.Module name')}</Th>
                  {hasModel && <Th>{t('common:support.wallet.usage.Ai model')}</Th>}
                  {hasToken && <Th>{t('common:support.wallet.usage.Token Length')}</Th>}
                  {hasCharsLen && <Th>{t('common:support.wallet.usage.Text Length')}</Th>}
                  {hasDuration && <Th>{t('common:support.wallet.usage.Duration')}</Th>}
                  <Th>{t('common:support.wallet.usage.Total points')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filterBillList.map((item, i) => (
                  <Tr key={i}>
                    <Td>{t(item.moduleName as any)}</Td>
                    {hasModel && <Td>{item.model ?? '-'}</Td>}
                    {hasToken && <Td>{item.tokens ?? '-'}</Td>}
                    {hasCharsLen && <Td>{item.charsLength ?? '-'}</Td>}
                    {hasDuration && <Td>{item.duration ?? '-'}</Td>}
                    <Td>{formatNumber(item.amount)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Box>
      </ModalBody>
    </MyModal>
  );
};

export default UsageDetail;
