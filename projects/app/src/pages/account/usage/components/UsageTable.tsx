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
  Tr
} from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { UsageSourceEnum, UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getUserUsages } from '@/web/support/wallet/usage/api';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { ExportModalParams } from './ExportModal';
import dynamic from 'next/dynamic';
import { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useToast } from '@fastgpt/web/hooks/useToast';

const UsageDetail = dynamic(() => import('./UsageDetail'));
const ExportModal = dynamic(() => import('./ExportModal'));

const UsageTableList = ({
  dateRange,
  selectTmbIds,
  usageSources,
  projectName,
  members,
  memberTotal,
  isSelectAllTmb,
  Tabs,
  Selectors
}: {
  dateRange: DateRangeType;
  selectTmbIds: string[];
  usageSources: UsageSourceEnum[];
  projectName: string;
  members: TeamMemberItemType[];
  memberTotal: number;
  isSelectAllTmb: boolean;
  Tabs: React.ReactNode;
  Selectors: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { toast } = useToast();

  const {
    data: usages,
    isLoading,
    Pagination,
    getData,
    total
  } = usePagination(getUserUsages, {
    pageSize: isPc ? 20 : 10,
    params: {
      dateStart: dateRange.from || new Date(),
      dateEnd: addDays(dateRange.to || new Date(), 1),
      sources: usageSources,
      teamMemberIds: selectTmbIds,
      isSelectAllTmb,
      projectName
    },
    defaultRequest: false
  });

  const [usageDetail, setUsageDetail] = useState<UsageItemType>();
  const [currentParams, setCurrentParams] = useState<ExportModalParams | null>(null);

  useEffect(() => {
    if ((!isSelectAllTmb && selectTmbIds.length === 0) || usageSources.length === 0) return;
    getData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageSources, selectTmbIds.length, projectName, dateRange, isSelectAllTmb]);

  return (
    <>
      <Box>{Tabs}</Box>
      <Flex flexDir={['column', 'row']} w={'100%'} alignItems={['flex-end', 'center']}>
        <Box>{Selectors}</Box>
        <Box flex={'1'} />
        <Button
          size={'md'}
          onClick={() => {
            if ((selectTmbIds.length === 0 && !isSelectAllTmb) || usageSources.length === 0) {
              return toast({
                status: 'warning',
                title: t('account_usage:select_member_and_source_first')
              });
            }

            setCurrentParams({
              dateStart: dateRange.from || new Date(),
              dateEnd: addDays(dateRange.to || new Date(), 1),
              sources: usageSources,
              teamMemberIds: selectTmbIds,
              teamMemberNames: members
                .filter((item) =>
                  isSelectAllTmb
                    ? !selectTmbIds.includes(item.tmbId)
                    : selectTmbIds.includes(item.tmbId)
                )
                .map((item) => item.memberName),
              isSelectAllTmb,
              projectName
            });
          }}
        >
          {t('common:Export')}
        </Button>
      </Flex>
      <MyBox position={'relative'} overflowY={'auto'} mt={3} flex={1} isLoading={isLoading}>
        <TableContainer>
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
                  <Td>{t(item.appName as any) || '-'}</Td>
                  <Td>{formatNumber(item.totalPoints) || 0}</Td>
                  <Td>
                    <Button
                      size={'sm'}
                      variant={'whitePrimary'}
                      onClick={() => setUsageDetail(item)}
                    >
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
      </MyBox>
      <Flex mt={3} justifyContent={'center'}>
        <Pagination />
      </Flex>

      {!!usageDetail && (
        <UsageDetail usage={usageDetail} onClose={() => setUsageDetail(undefined)} />
      )}

      {!!currentParams && (
        <ExportModal
          onClose={() => setCurrentParams(null)}
          params={currentParams}
          memberTotal={isSelectAllTmb ? memberTotal - selectTmbIds.length : selectTmbIds.length}
          total={total}
        />
      )}
    </>
  );
};

export default UsageTableList;
