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
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getOperationLogs } from '@/web/support/user/team/operantionLog/api';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { operationLogI18nMap } from '@fastgpt/service/support/operationLog/constants';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import UserBox from '@fastgpt/web/components/common/UserBox';

function OperationLogTable({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useTranslation();

  const [searchKey, setSearchKey] = useState<string>('');
  const {
    data: operationLogs = [],
    isLoading: loadingLogs,
    ScrollData: LogScrollData
  } = useScrollPagination(getOperationLogs, {
    pageSize: 20,
    refreshDeps: [searchKey],
    throttleWait: 500,
    debounceWait: 200
  });

  const isLoading = loadingLogs;

  return (
    <>
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
      </Flex>

      <MyBox isLoading={isLoading} flex={'1 0 0'} overflow={'auto'}>
        <LogScrollData>
          <TableContainer overflow={'unset'} fontSize={'sm'}>
            <Table overflow={'unset'}>
              <Thead>
                <Tr bgColor={'white !important'}>
                  <Th borderLeftRadius="6px" bgColor="myGray.100">
                    {t('account_team:log_user')}
                  </Th>
                  <Th bgColor="myGray.100">{t('account_team:log_time')}</Th>
                  <Th bgColor="myGray.100">{t('account_team:log_type')}</Th>
                  <Th bgColor="myGray.100">{t('account_team:log_details')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {operationLogs?.map((log) => {
                  const i18nData = operationLogI18nMap[log.event];
                  const metadata = { ...log.metadata };

                  if (log.event === OperationLogEventEnum.ASSIGN_PERMISSION) {
                    const permissionValue = parseInt(metadata.permission, 10);

                    const permission = new TeamPermission({ per: permissionValue });
                    metadata.appCreate = permission.hasAppCreatePer ? '✔' : '✘';
                    metadata.datasetCreate = permission.hasDatasetCreatePer ? '✔' : '✘';
                    metadata.apiKeyCreate = permission.hasApikeyCreatePer ? '✔' : '✘';
                    metadata.manage = permission.hasManagePer ? '✔' : '✘';
                  }

                  return i18nData ? (
                    <Tr key={log._id} overflow={'unset'}>
                      <Td>
                        <UserBox
                          sourceMember={log.sourceMember}
                          fontSize="sm"
                          avatarSize="1rem"
                          spacing={0.5}
                        />
                      </Td>
                      <Td>{formatTime2YMDHMS(log.timestamp)}</Td>
                      <Td>{t(i18nData.typeLabel)}</Td>
                      <Td>{t(i18nData.content, metadata as any) as string}</Td>
                    </Tr>
                  ) : null;
                })}
              </Tbody>
            </Table>
          </TableContainer>
        </LogScrollData>
      </MyBox>
    </>
  );
}

export default OperationLogTable;
