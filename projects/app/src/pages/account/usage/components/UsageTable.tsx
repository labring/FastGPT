import { Button, Flex, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import UsageDetail from './UsageDetail';
import Avatar from '@fastgpt/web/components/common/Avatar';

const UsageTableList = ({ usages, isLoading }: { usages: UsageItemType[]; isLoading: boolean }) => {
  const { t } = useTranslation();

  const [usageDetail, setUsageDetail] = useState<UsageItemType>();

  return (
    <>
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
                      <Avatar src={item.tmbAvatar} w={'20px'} mr={1} rounded={'full'} />
                      {item.tmbName}
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

      {!!usageDetail && (
        <UsageDetail usage={usageDetail} onClose={() => setUsageDetail(undefined)} />
      )}
    </>
  );
};

export default UsageTableList;
