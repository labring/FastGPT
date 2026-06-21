import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import {
  deleteEnterpriseRoleBinding,
  getDatasetSyncStatus,
  listEnterpriseAuditLogs,
  listEnterpriseRoleBindings,
  reconcileDatasetSync,
  retryDatasetSync,
  runEnterpriseStagingSmoke,
  upsertEnterpriseRoleBinding,
  type EnterpriseAuditListQuery,
  type EnterpriseRoleBindingItem
} from '@/web/support/enterprise/api';
import { getTeamMembers } from '@/web/support/user/team/api';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import {
  EnterpriseAuditActionEnum,
  EnterpriseAuditResultEnum,
  EnterpriseAuditResourceTypeEnum
} from '@fastgpt/global/support/enterprise/audit/constants';
import {
  EnterpriseRoleEnum,
  EnterpriseRoleMap
} from '@fastgpt/global/support/enterprise/rbac/constants';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Input,
  Select,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast
} from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import Tag from '@fastgpt/web/components/common/Tag';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMemo, useState } from 'react';

enum EnterpriseTabEnum {
  audit = 'audit',
  rbac = 'rbac',
  knowledge = 'knowledge',
  staging = 'staging'
}

const pageSize = 20;

const EnterprisePage = () => {
  const toast = useToast();
  const [tab, setTab] = useState(EnterpriseTabEnum.audit);
  const [auditQuery, setAuditQuery] = useState<EnterpriseAuditListQuery>({
    pageNum: 1,
    pageSize
  });
  const [auditDraft, setAuditDraft] = useState<EnterpriseAuditListQuery>({});
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<EnterpriseRoleEnum[]>([]);
  const [datasetId, setDatasetId] = useState('');
  const [stagingBaseUrl, setStagingBaseUrl] = useState('');

  const Tabs = (
    <FillRowTabs
      list={[
        { label: 'Audit', value: EnterpriseTabEnum.audit },
        { label: 'RBAC', value: EnterpriseTabEnum.rbac },
        { label: 'Knowledge Sync', value: EnterpriseTabEnum.knowledge },
        { label: 'Staging', value: EnterpriseTabEnum.staging }
      ]}
      value={tab}
      onChange={(value) => setTab(value)}
    />
  );

  const { data: auditData, loading: auditLoading } = useRequest(
    () => listEnterpriseAuditLogs(auditQuery),
    {
      manual: false,
      refreshDeps: [auditQuery]
    }
  );

  const {
    data: members,
    loading: membersLoading,
    refreshAsync: refreshMembers
  } = useRequest(
    () =>
      getTeamMembers({
        pageNum: 1,
        pageSize: 200,
        status: 'active'
      }),
    {
      manual: false
    }
  );

  const {
    data: roleBindings,
    loading: rbacLoading,
    refreshAsync: refreshRoleBindings
  } = useRequest(listEnterpriseRoleBindings, {
    manual: false
  });

  const {
    data: syncStatus,
    loading: syncStatusLoading,
    runAsync: runSyncStatus
  } = useRequest(getDatasetSyncStatus, {
    manual: true
  });
  const {
    data: reconcileResult,
    loading: reconcileLoading,
    runAsync: runReconcile
  } = useRequest(reconcileDatasetSync, {
    manual: true,
    successToast: 'Scheduler reconcile completed'
  });
  const {
    data: retryResult,
    loading: retryLoading,
    runAsync: runRetry
  } = useRequest(retryDatasetSync, {
    manual: true,
    successToast: 'Dataset sync retry queued'
  });
  const {
    data: stagingResult,
    loading: stagingLoading,
    runAsync: runStagingSmoke
  } = useRequest(runEnterpriseStagingSmoke, {
    manual: true
  });
  const { runAsync: saveRoleBinding, loading: savingRole } = useRequest(
    upsertEnterpriseRoleBinding,
    {
      manual: true,
      successToast: 'Enterprise role saved',
      onSuccess: () => refreshRoleBindings()
    }
  );
  const { runAsync: removeRoleBinding } = useRequest(deleteEnterpriseRoleBinding, {
    manual: true,
    successToast: 'Enterprise role removed',
    onSuccess: () => refreshRoleBindings()
  });

  const memberList = useMemo(() => members?.list || [], [members?.list]);
  const selectedMember = memberList.find(
    (member: TeamMemberItemType) => member.userId === selectedMemberId
  );

  const exportAudit = () => {
    const params = new URLSearchParams();
    Object.entries({ ...auditDraft, limit: 10000 }).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
    window.open(getWebReqUrl(`/api/support/enterprise/audit/export?${params.toString()}`));
  };

  const onSelectMember = (userId: string) => {
    setSelectedMemberId(userId);
    const binding = roleBindings?.find((item) => item.userId === userId);
    setSelectedRoles(binding?.roles || []);
  };

  const onToggleRole = (role: EnterpriseRoleEnum, checked: boolean) => {
    setSelectedRoles((state) =>
      checked ? Array.from(new Set([...state, role])) : state.filter((item) => item !== role)
    );
  };

  const onSaveRole = async () => {
    if (!selectedMember) {
      toast({ status: 'warning', title: 'Select a team member first' });
      return;
    }
    await saveRoleBinding({
      userId: selectedMember.userId,
      tmbId: selectedMember.tmbId,
      roles: selectedRoles
    });
  };

  return (
    <AccountContainer>
      <Flex flexDirection="column" h="100%" p="24px" gap={4}>
        <Flex align="center" justify="space-between" gap={4}>
          <Box fontSize="20px" fontWeight="600">
            Enterprise Operations
          </Box>
          <Box>{Tabs}</Box>
        </Flex>

        {tab === EnterpriseTabEnum.audit && (
          <MyBox isLoading={auditLoading} flex="1" overflow="auto">
            <Flex gap={3} wrap="wrap" mb={4} align="center">
              <Input
                w="220px"
                size="sm"
                placeholder="Search action, actor, resource"
                value={auditDraft.searchKey || ''}
                onChange={(e) =>
                  setAuditDraft((state) => ({ ...state, searchKey: e.target.value }))
                }
              />
              <Select
                w="180px"
                size="sm"
                value={auditDraft.action || ''}
                onChange={(e) => setAuditDraft((state) => ({ ...state, action: e.target.value }))}
              >
                <option value="">All actions</option>
                {Object.values(EnterpriseAuditActionEnum).map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </Select>
              <Select
                w="140px"
                size="sm"
                value={auditDraft.result || ''}
                onChange={(e) => setAuditDraft((state) => ({ ...state, result: e.target.value }))}
              >
                <option value="">All results</option>
                {Object.values(EnterpriseAuditResultEnum).map((result) => (
                  <option key={result} value={result}>
                    {result}
                  </option>
                ))}
              </Select>
              <Select
                w="160px"
                size="sm"
                value={auditDraft.resourceType || ''}
                onChange={(e) =>
                  setAuditDraft((state) => ({ ...state, resourceType: e.target.value }))
                }
              >
                <option value="">All resources</option>
                {Object.values(EnterpriseAuditResourceTypeEnum).map((resourceType) => (
                  <option key={resourceType} value={resourceType}>
                    {resourceType}
                  </option>
                ))}
              </Select>
              <Input
                w="180px"
                size="sm"
                placeholder="Resource ID"
                value={auditDraft.resourceId || ''}
                onChange={(e) =>
                  setAuditDraft((state) => ({ ...state, resourceId: e.target.value }))
                }
              />
              <Input
                w="210px"
                size="sm"
                type="datetime-local"
                value={auditDraft.startTime || ''}
                onChange={(e) =>
                  setAuditDraft((state) => ({ ...state, startTime: e.target.value }))
                }
              />
              <Input
                w="210px"
                size="sm"
                type="datetime-local"
                value={auditDraft.endTime || ''}
                onChange={(e) => setAuditDraft((state) => ({ ...state, endTime: e.target.value }))}
              />
              <Button
                size="sm"
                onClick={() => setAuditQuery({ ...auditDraft, pageNum: 1, pageSize })}
              >
                Search
              </Button>
              <Button size="sm" variant="whitePrimary" onClick={exportAudit}>
                Export CSV
              </Button>
            </Flex>
            <TableContainer>
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Time</Th>
                    <Th>Action</Th>
                    <Th>Result</Th>
                    <Th>Actor</Th>
                    <Th>Resource</Th>
                    <Th>Client</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {auditData?.list.map((item) => (
                    <Tr key={item._id}>
                      <Td whiteSpace="nowrap">{formatTime2YMDHMS(item.timestamp)}</Td>
                      <Td>{item.action}</Td>
                      <Td>
                        <Tag colorSchema={item.result === 'success' ? 'green' : 'red'}>
                          {item.result}
                        </Tag>
                      </Td>
                      <Td>
                        <Box>{item.actor?.name || item.actor?.type}</Box>
                        <Box fontSize="xs" color="myGray.500">
                          {item.actor?.userId}
                        </Box>
                      </Td>
                      <Td>
                        <Box>{item.resource?.name || item.resource?.type}</Box>
                        <Box fontSize="xs" color="myGray.500">
                          {item.resource?.id}
                        </Box>
                      </Td>
                      <Td>{item.clientIp || '-'}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
            <Flex justify="space-between" align="center" mt={4}>
              <Box fontSize="sm" color="myGray.500">
                Total {auditData?.total || 0}
              </Box>
              <Flex gap={2}>
                <Button
                  size="sm"
                  variant="whiteBase"
                  isDisabled={(auditQuery.pageNum || 1) <= 1}
                  onClick={() =>
                    setAuditQuery((state) => ({
                      ...state,
                      pageNum: Math.max((state.pageNum || 1) - 1, 1),
                      pageSize
                    }))
                  }
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="whiteBase"
                  isDisabled={(auditData?.list.length || 0) < pageSize}
                  onClick={() =>
                    setAuditQuery((state) => ({
                      ...state,
                      pageNum: (state.pageNum || 1) + 1,
                      pageSize
                    }))
                  }
                >
                  Next
                </Button>
              </Flex>
            </Flex>
          </MyBox>
        )}

        {tab === EnterpriseTabEnum.rbac && (
          <Flex flex="1" gap={6} overflow="auto" align="flex-start">
            <Box w="360px">
              {membersLoading ? <MyLoading /> : null}
              <Box mb={2} fontWeight="600">
                Team member
              </Box>
              <Select value={selectedMemberId} onChange={(e) => onSelectMember(e.target.value)}>
                <option value="">Select member</option>
                {memberList.map((member: TeamMemberItemType) => (
                  <option key={member.tmbId} value={member.userId}>
                    {member.memberName} · {member.userId}
                  </option>
                ))}
              </Select>
              <Flex direction="column" gap={3} mt={4}>
                {Object.values(EnterpriseRoleEnum).map((role) => (
                  <Checkbox
                    key={role}
                    isChecked={selectedRoles.includes(role)}
                    onChange={(e) => onToggleRole(role, e.target.checked)}
                  >
                    <Box>
                      <Box>{EnterpriseRoleMap[role].label}</Box>
                      <Box fontSize="xs" color="myGray.500">
                        {EnterpriseRoleMap[role].description}
                      </Box>
                    </Box>
                  </Checkbox>
                ))}
              </Flex>
              <Flex mt={4} gap={2}>
                <Button size="sm" isLoading={savingRole} onClick={onSaveRole}>
                  Save role
                </Button>
                <Button size="sm" variant="whiteBase" onClick={() => refreshMembers()}>
                  Refresh members
                </Button>
              </Flex>
            </Box>
            <Box flex="1">
              <MyBox isLoading={rbacLoading}>
                <TableContainer>
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th>User</Th>
                        <Th>Roles</Th>
                        <Th>Updated</Th>
                        <Th>Action</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {roleBindings?.map((binding: EnterpriseRoleBindingItem) => (
                        <Tr key={binding._id}>
                          <Td>
                            <Box>{binding.user?.username || binding.userId}</Box>
                            <Box fontSize="xs" color="myGray.500">
                              {binding.userId}
                            </Box>
                          </Td>
                          <Td>
                            <Flex gap={2} wrap="wrap">
                              {binding.roles.map((role) => (
                                <Tag key={role} colorSchema="blue">
                                  {EnterpriseRoleMap[role].label}
                                </Tag>
                              ))}
                            </Flex>
                          </Td>
                          <Td>{formatTime2YMDHMS(new Date(binding.updateTime))}</Td>
                          <Td>
                            <Button
                              size="sm"
                              variant="whiteDanger"
                              onClick={() => removeRoleBinding(binding.userId)}
                            >
                              Remove
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              </MyBox>
            </Box>
          </Flex>
        )}

        {tab === EnterpriseTabEnum.knowledge && (
          <Flex direction="column" gap={4}>
            <Flex gap={3} align="center">
              <Input
                w="360px"
                placeholder="Dataset ID"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
              />
              <Button
                isLoading={syncStatusLoading}
                onClick={() => datasetId && runSyncStatus(datasetId)}
              >
                Check status
              </Button>
              <Button
                variant="whitePrimary"
                isLoading={retryLoading}
                onClick={() => datasetId && runRetry(datasetId)}
              >
                Retry sync
              </Button>
              <Button
                variant="whiteBase"
                isLoading={reconcileLoading}
                onClick={() => runReconcile()}
              >
                Reconcile schedulers
              </Button>
            </Flex>
            <ResultBlock title="Dataset sync status" data={syncStatus} />
            <ResultBlock title="Retry result" data={retryResult} />
            <ResultBlock title="Reconcile result" data={reconcileResult} />
          </Flex>
        )}

        {tab === EnterpriseTabEnum.staging && (
          <Flex direction="column" gap={4} maxW="760px">
            <Flex gap={3}>
              <Input
                placeholder="https://fastgpt-staging.example.com"
                value={stagingBaseUrl}
                onChange={(e) => setStagingBaseUrl(e.target.value)}
              />
              <Button
                minW="140px"
                isLoading={stagingLoading}
                onClick={() => runStagingSmoke(stagingBaseUrl || undefined)}
              >
                Run smoke
              </Button>
            </Flex>
            <ResultBlock title="Staging smoke result" data={stagingResult} />
          </Flex>
        )}
      </Flex>
    </AccountContainer>
  );
};

const ResultBlock = ({ title, data }: { title: string; data: unknown }) => (
  <Box>
    <Box fontWeight="600" mb={2}>
      {title}
    </Box>
    <Box
      as="pre"
      overflow="auto"
      bg="myGray.50"
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="6px"
      p={3}
      fontSize="xs"
      minH="80px"
    >
      {data ? JSON.stringify(data, null, 2) : 'No result'}
    </Box>
  </Box>
);

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'common']))
    }
  };
}

export default EnterprisePage;
