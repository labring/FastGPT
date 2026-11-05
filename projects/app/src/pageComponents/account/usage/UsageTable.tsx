import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { Box, Button, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import { type UsageListItemType } from '@fastgpt/global/support/wallet/usage/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { accountContentScrollStyles, accountPageRootStyles } from '@/pageComponents/account/styles';
import type { UsageFilterController } from './useUsageFilterController';
import UsageExportButton from './UsageExportButton';
import UsagePagination from './UsagePagination';
import { UsageMember } from './UsageMember';
import { scrollPaginationContentToTop } from '@fastgpt/web/hooks/usePagination';

const UsageDetail = dynamic(() => import('./UsageDetail'));

const UsageTableList = ({
  controller,
  Tabs,
  Selectors
}: {
  Tabs: React.ReactNode;
  Selectors: React.ReactNode;
  controller: UsageFilterController;
}) => {
  const { t } = useSafeTranslation();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const usages = controller.result?.view === 'detail' ? controller.result.data.list : [];
  const isLoading = controller.loading;

  const [usageDetail, setUsageDetail] = useState<UsageListItemType>();

  useEffect(() => {
    // 只有新结果提交后回顶，打开筛选器或导出时的 loading 不改变当前位置。
    if (controller.result?.view !== 'detail') return;
    const frame = window.requestAnimationFrame(() =>
      scrollPaginationContentToTop(scrollContainerRef.current)
    );
    return () => window.cancelAnimationFrame(frame);
  }, [controller.result]);

  return (
    <MyBox
      {...accountPageRootStyles}
      display={'flex'}
      flexDirection={'column'}
      isLoading={isLoading}
    >
      <Flex
        px={[3, 6]}
        w={'100%'}
        flexDirection={['column', 'row']}
        flexWrap={['nowrap', 'wrap']}
        alignItems={['stretch', 'center']}
        justifyContent={'space-between'}
        gap={[4, 6]}
      >
        <Box flexShrink={0}>{Tabs}</Box>
        <Flex
          flex={['0 0 auto', '1 1 auto']}
          minW={['0', 'min-content']}
          flexWrap={'wrap'}
          alignItems={'flex-start'}
          justifyContent={'flex-end'}
          gap={3}
        >
          <Box flex={'0 0 auto'} minW={0} w={['100%', 'auto']}>
            {Selectors}
          </Box>
          <Box display={['none', 'block']} flexShrink={0}>
            <UsageExportButton controller={controller} />
          </Box>
        </Flex>
      </Flex>
      <Flex display={['flex', 'none']} mt={3} px={3} w={'100%'}>
        <UsageExportButton controller={controller} w={'100%'} />
      </Flex>
      <FixedTableContainer
        maxH="none"
        ref={scrollContainerRef}
        {...accountContentScrollStyles}
        mt={3}
        px={[3, 4]}
        footer={
          <>
            <Flex mt={3} justifyContent={'center'}>
              <UsagePagination controller={controller} />
            </Flex>
          </>
        }
        h={['60dvh', 0]}
      >
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
                  <UsageMember member={item.sourceMember} />
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
        {!isLoading && !controller.error && usages.length === 0 && (
          <EmptyTip
            text={
              <Box color={'myGray.500'}>
                {t('account_usage:no_matching_members')}
                <Box as={'button'} type={'button'} color={'primary.700'} onClick={controller.clear}>
                  {t('account_usage:clear_filters')}
                </Box>
              </Box>
            }
          />
        )}
      </FixedTableContainer>

      {!!usageDetail && usages.some((item) => item.id === usageDetail.id) && (
        <UsageDetail usage={usageDetail} onClose={() => setUsageDetail(undefined)} />
      )}
    </MyBox>
  );
};

export default React.memo(UsageTableList);
