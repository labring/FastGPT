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
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';

const UsageDetail = ({ usage, onClose }: { usage: UsageItemType; onClose: () => void }) => {
  const { t } = useTranslation();
  const filterBillList = useMemo(
    () => usage.list.filter((item) => item && item.moduleName),
    [usage.list]
  );

  const { hasModel, hasInputTokens, hasOutputTokens, hasCharsLen, hasDuration } = useMemo(() => {
    let hasModel = false;
    let hasInputTokens = false;
    let hasOutputTokens = false;
    let hasCharsLen = false;
    let hasDuration = false;
    let hasDataLen = false;

    usage.list.forEach((item) => {
      if (item.model !== undefined) {
        hasModel = true;
      }

      if (typeof item.inputTokens === 'number') {
        hasInputTokens = true;
      }
      if (typeof item.outputTokens === 'number') {
        hasOutputTokens = true;
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
      hasInputTokens,
      hasOutputTokens,
      hasCharsLen,
      hasDuration,
      hasDataLen
    };
  }, [usage.list]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/usage.svg"
      title={t('support.wallet.usage.Usage Detail')}
      maxW={['90vw', '700px']}
    >
      <ModalBody>
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 80px'}>{t('support.wallet.bill.Number')}:</Box>
          <Box>{usage.id}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 80px'}>{t('wallet.usage.Time')}:</Box>
          <Box>{dayjs(usage.time).format('YYYY/MM/DD HH:mm:ss')}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 80px'}>{t('wallet.usage.App name')}:</Box>
          <Box>{t(usage.appName) || '-'}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 80px'}>{t('wallet.usage.Source')}:</Box>
          <Box>{t(UsageSourceMap[usage.source]?.label)}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 80px'}>{t('wallet.usage.Total')}:</Box>
          <Box fontWeight={'bold'}>{usage.total}元</Box>
        </Flex>
        <Box pb={4}>
          <Box flex={'0 0 80px'} mb={1}>
            {t('wallet.usage.Bill Module')}
          </Box>
          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('wallet.usage.Module name')}</Th>
                  {hasModel && <Th>{t('wallet.usage.Ai model')}</Th>}
                  {hasInputTokens && <Th>{t('wallet.usage.Input Token Length')}</Th>}
                  {hasOutputTokens && <Th>{t('wallet.usage.Output Token Length')}</Th>}
                  {hasCharsLen && <Th>{t('wallet.usage.Text Length')}</Th>}
                  {hasDuration && <Th>{t('wallet.usage.Duration')}</Th>}

                  <Th>费用(￥)</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filterBillList.map((item, i) => (
                  <Tr key={i}>
                    <Td>{t(item.moduleName)}</Td>
                    {hasModel && <Td>{item.model ?? '-'}</Td>}
                    {hasInputTokens && <Td>{item.inputTokens ?? '-'}</Td>}
                    {hasOutputTokens && <Td>{item.outputTokens ?? '-'}</Td>}
                    {hasCharsLen && <Td>{item.charsLength ?? '-'}</Td>}
                    {hasDuration && <Td>{item.duration ?? '-'}</Td>}
                    <Td>{formatStorePrice2Read(item.amount)}</Td>
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
