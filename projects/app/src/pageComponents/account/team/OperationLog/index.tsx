import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
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
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { getOperationLogs } from '@/web/support/user/team/operantionLog/api';
import { operationLogType } from '@fastgpt/global/support/operationLog/type';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

function OperationLogTable({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useTranslation();

  const parsePermissionValueToText = (value: string | number) => {
    try {
      const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
      const permission = new TeamPermission({ per: numValue });

      const hasWritePer = `${t('user:team.group.permission.write')}${permission.hasWritePer ? '✔' : '✘'}`;
      const hasManagePer = `${t('user:team.group.permission.manage')}${permission.hasManagePer ? '✔' : '✘'}`;

      return `[${hasWritePer}, ${hasManagePer}]`;
    } catch (e) {
      return String(value);
    }
  };

  const renderLogContent = (text: string) => {
    return text.split(/(\*\*\d+\*\*)/g).map((part, index) => {
      const isPermissionValue = /^\*\*\d+\*\*$/.test(part);

      if (isPermissionValue) {
        const rawValue = part.slice(2, -2);
        return (
          <Box as="span" key={index} fontWeight="bold">
            {parsePermissionValueToText(rawValue)}
          </Box>
        );
      }
      return part;
    });
  };

  const [searchKey, setSearchKey] = useState<string>('');
  const {
    data: operationLogs = [],
    isLoading: loadingLogs,
    ScrollData: LogScrollData
  } = useScrollPagination<any, PaginationResponse<operationLogType>>(getOperationLogs, {
    pageSize: 20,
    refreshDeps: [searchKey, status],
    throttleWait: 500,
    debounceWait: 200
  });

  const operationLogEventMap: Record<string, string> = {
    LOGIN: t('account_team:login'),
    CREATE_INVITATION_LINK: t('account_team:create_invitation_link'),
    JOIN_TEAM: t('account_team:join_team'),
    CHANGE_MEMBER_NAME: t('account_team:change_member_name'),
    KICK_OUT_TEAM: t('account_team:kick_out_team'),
    CREATE_DEPARTMENT: t('account_team:create_department'),
    CHANGE_DEPARTMENT: t('account_team:change_department_name'),
    DELETE_DEPARTMENT: t('account_team:delete_department'),
    RELOCATE_DEPARTMENT: t('account_team:relocate_department'),
    CREATE_GROUP: t('account_team:create_group'),
    DELETE_GROUP: t('account_team:delete_group'),
    ASSIGN_PERMISSION: t('account_team:assign_permission')
  };

  const isLoading = loadingLogs;

  return (
    <>
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
        <Box w="200px">
          <SearchInput
            placeholder={t('account_team:search_log')}
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
          />
        </Box>
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
                {operationLogs?.map((log) => (
                  <Tr key={log._id} overflow={'unset'}>
                    <Td>{log.name}</Td>
                    <Td>{new Date(log.timestamp).toLocaleString()}</Td>
                    <Td>{operationLogEventMap[log.event] || log.event}</Td>
                    <Td>
                      {log.event === 'ASSIGN_PERMISSION'
                        ? renderLogContent(log.operationLog)
                        : log.operationLog}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </LogScrollData>
      </MyBox>
    </>
  );
}

export default OperationLogTable;
