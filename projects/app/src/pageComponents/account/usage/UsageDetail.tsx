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
import { type UsageListItemType } from '@fastgpt/global/support/wallet/usage/type.d';
import dayjs from 'dayjs';
import { UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

const UsageDetail = ({ usage, onClose }: { usage: UsageListItemType; onClose: () => void }) => {
  const { t } = useSafeTranslation();
  const filterBillList = useMemo(
    () => usage.list.filter((item) => item && item.moduleName),
    [usage.list]
  );

  const {
    hasModel,
    hasToken,
    hasInputToken,
    hasOutputToken,
    hasCharsLen,
    hasDuration,
    hasPages,
    hasCount
  } = useMemo(() => {
    let hasModel = false;
    let hasToken = false;
    let hasInputToken = false;
    let hasOutputToken = false;
    let hasCharsLen = false;
    let hasDuration = false;
    let hasPages = false;
    let hasCount = false;

    usage.list.forEach((item) => {
      if (item.model !== undefined) {
        hasModel = true;
      }

      if (typeof item.tokens === 'number') {
        hasToken = true;
      }
      if (typeof item.inputTokens === 'number') {
        hasInputToken = true;
      }
      if (typeof item.outputTokens === 'number') {
        hasOutputToken = true;
      }
      if (typeof item.charsLength === 'number') {
        hasCharsLen = true;
      }
      if (typeof item.duration === 'number') {
        hasDuration = true;
      }
      if (typeof item.pages === 'number') {
        hasPages = true;
      }
      if (typeof item.count === 'number') {
        hasCount = true;
      }
    });

    return {
      hasModel,
      hasToken,
      hasInputToken,
      hasOutputToken,
      hasCharsLen,
      hasDuration,
      hasPages,
      hasCount
    };
  }, [usage.list]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/bill.svg"
      title={t('account_usage:usage_detail')}
      maxW={['90vw', '700px']}
    >
      <ModalBody>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('account_usage:order_number')}:</FormLabel>
          <Box>{usage.id}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('account_usage:generation_time')}:</FormLabel>
          <Box>{dayjs(usage.time).format('YYYY/MM/DD HH:mm:ss')}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('account_usage:app_name')}:</FormLabel>
          <Box>{t(usage.appName as any) || '-'}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('account_usage:source')}:</FormLabel>
          <Box>{t(UsageSourceMap[usage.source]?.label as any)}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('account_usage:total_points_consumed')}:</FormLabel>
          <Box fontWeight={'bold'}>{formatNumber(usage.totalPoints)}</Box>
        </Flex>
        <Box pb={4}>
          <FormLabel flex={'0 0 80px'} mb={1}>
            {t('account_usage:billing_module')}
          </FormLabel>
          <TableContainer fontSize={'sm'}>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('account_usage:module_name')}</Th>
                  {hasModel && <Th>{t('account_usage:ai_model')}</Th>}
                  {hasToken && <Th>{t('account_usage:token_length')}</Th>}
                  {hasInputToken && <Th>{t('account_usage:input_token_length')}</Th>}
                  {hasOutputToken && <Th>{t('account_usage:output_token_length')}</Th>}
                  {hasCount && <Th>{t('account_usage:count')}</Th>}
                  {hasCharsLen && <Th>{t('account_usage:text_length')}</Th>}
                  {hasDuration && <Th>{t('account_usage:duration_seconds')}</Th>}
                  {hasPages && <Th>{t('account_usage:pages')}</Th>}
                  <Th>{t('account_usage:total_points_consumed')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filterBillList.map((item, i) => (
                  <Tr key={i}>
                    <Td>{t(item.moduleName as any)}</Td>
                    {hasModel && <Td>{item.model ?? '-'}</Td>}
                    {hasToken && <Td>{item.tokens ?? '-'}</Td>}
                    {hasInputToken && <Td>{item.inputTokens ?? '-'}</Td>}
                    {hasOutputToken && <Td>{item.outputTokens ?? '-'}</Td>}
                    {hasCount && <Td>{item.count ?? '-'}</Td>}
                    {hasCharsLen && <Td>{item.charsLength ?? '-'}</Td>}
                    {hasDuration && <Td>{item.duration ?? '-'}</Td>}
                    {hasPages && <Td>{item.pages ?? '-'}</Td>}
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
