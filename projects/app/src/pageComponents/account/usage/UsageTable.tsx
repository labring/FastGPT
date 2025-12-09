import {
  Box,
  Button,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import { type UsageListItemType } from '@fastgpt/global/support/wallet/usage/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import dayjs from 'dayjs';
import React, { useMemo, useState } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getUserUsages } from '@/web/support/wallet/usage/api';
import { addDays } from 'date-fns';
import dynamic from 'next/dynamic';
import { type UsageFilterParams } from './type';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { downloadFetch } from '@/web/common/system/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

const UsageDetail = dynamic(() => import('./UsageDetail'));
const RechargeModal = dynamic(() =>
  import('@/components/support/wallet/NotSufficientModal/index').then((mod) => mod.RechargeModal)
);

const UsageTableList = ({
  filterParams,
  Tabs,
  Selectors
}: {
  Tabs: React.ReactNode;
  Selectors: React.ReactNode;
  filterParams: UsageFilterParams;
}) => {
  const { t } = useSafeTranslation();
  const {
    isOpen: isOpenRecharge,
    onOpen: onOpenRecharge,
    onClose: onCloseRecharge
  } = useDisclosure();

  const { dateRange, selectTmbIds, isSelectAllTmb, usageSources, isSelectAllSource, projectName } =
    filterParams;
  const requestParams = useMemo(() => {
    return {
      dateStart: dayjs(dateRange.from || new Date()).format(),
      dateEnd: dayjs(addDays(dateRange.to || new Date(), 1)).format(),
      sources: isSelectAllSource ? undefined : usageSources,
      teamMemberIds: isSelectAllTmb ? undefined : selectTmbIds,
      projectName
    };
  }, [
    dateRange.from,
    dateRange.to,
    isSelectAllSource,
    isSelectAllTmb,
    projectName,
    selectTmbIds,
    usageSources
  ]);

  const {
    data: usages,
    isLoading,
    Pagination,
    total
  } = usePagination(getUserUsages, {
    defaultPageSize: 20,
    params: requestParams,
    refreshDeps: [requestParams]
  });

  const [usageDetail, setUsageDetail] = useState<UsageListItemType>();

  const { runAsync: exportUsage } = useRequest2(
    async () => {
      await downloadFetch({
        url: `/api/proApi/support/wallet/usage/exportUsage`,
        filename: `usage.csv`,
        body: {
          ...requestParams,
          appNameMap: {
            ['core.app.Question Guide']: t('common:core.app.Question Guide'),
            ['common:support.wallet.usage.Audio Speech']: t(
              'common:support.wallet.usage.Audio Speech'
            ),
            ['support.wallet.usage.Whisper']: t('common:support.wallet.usage.Whisper'),
            ['account_usage:embedding_index']: t('account_usage:embedding_index'),
            ['account_usage:qa']: t('account_usage:qa'),
            ['core.dataset.training.Auto mode']: t('common:core.dataset.training.Auto mode'),
            ['common:core.module.template.ai_chat']: t('common:core.module.template.ai_chat')
          },
          sourcesMap: Object.fromEntries(
            Object.entries(UsageSourceMap).map(([key, config]) => [
              key,
              {
                label: t(config.label as any)
              }
            ])
          ),
          title: t('account_usage:export_title')
        }
      });
    },
    {
      refreshDeps: [requestParams]
    }
  );

  return (
    <MyBox display={'flex'} flexDirection={'column'} h={'100%'} isLoading={isLoading}>
      <Flex>
        <Box>{Tabs}</Box>
        <Box flex={1} />
        <Button
          size={'md'}
          variant={'transparentBase'}
          color={'primary.700'}
          onClick={onOpenRecharge}
        >
          {t('account_usage:check_left_points')}
        </Button>
      </Flex>
      <Flex mt={4} w={'100%'}>
        <Box>{Selectors}</Box>
        <Box flex={'1'} />

        <PopoverConfirm
          Trigger={<Button size={'md'}>{t('common:Export')}</Button>}
          showCancel
          content={t('account_usage:export_confirm_tip', { total })}
          onConfirm={exportUsage}
        />
      </Flex>
      <TableContainer mt={3} flex={'1 0 0'} h={0} overflowY={'auto'}>
        <Table>
          <Thead>
            <Tr>
              <Th>{t('common:user.Time')}</Th>
              <Th>{t('account_usage:member')}</Th>
              <Th>{t('account_usage:user_type')}</Th>
              <Th>{t('account_usage:project_name')}</Th>
              <Th>{t('account_usage:total_points')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {usages.map((item) => (
              <Tr key={item.id}>
                <Td>{dayjs(item.time).format('YYYY/MM/DD HH:mm:ss')}</Td>
                <Td>
                  <Flex alignItems={'center'} color={'myGray.500'}>
                    <Avatar src={item.sourceMember.avatar} w={'20px'} mr={1} rounded={'full'} />
                    {item.sourceMember.name}
                  </Flex>
                </Td>
                <Td>{t(UsageSourceMap[item.source]?.label as any) || '-'}</Td>
                <Td className="textEllipsis" maxW={'400px'} title={t(item.appName as any)}>
                  {t(item.appName as any) || '-'}
                </Td>
                <Td>{formatNumber(item.totalPoints) || 0}</Td>
                <Td>
                  <Button size={'sm'} variant={'whitePrimary'} onClick={() => setUsageDetail(item)}>
                    {t('account_usage:details')}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!isLoading && usages.length === 0 && (
          <EmptyTip text={t('account_usage:no_usage_records')}></EmptyTip>
        )}
      </TableContainer>
      <Flex mt={3} justifyContent={'center'}>
        <Pagination />
      </Flex>

      {!!usageDetail && (
        <UsageDetail usage={usageDetail} onClose={() => setUsageDetail(undefined)} />
      )}

      {isOpenRecharge && <RechargeModal onClose={onCloseRecharge} onPaySuccess={onCloseRecharge} />}
    </MyBox>
  );
};

export default React.memo(UsageTableList);
