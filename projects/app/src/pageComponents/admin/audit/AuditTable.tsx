'use client';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { Table, Thead, Tbody, Tr, Th, Td, Flex, Box, FormLabel } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { getOperationLogs } from '@/web/admin/system/audit/api';
import { adminAuditLogMap } from '@fastgpt/web/support/user/audit/constants';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import UserBox from '@fastgpt/web/components/common/UserBox';
import {
  MultiSelectFilter,
  createMultiSelectFilter,
  toMultiSelectFilterQuery,
  useCommonFilterLabels,
  type MultiSelectFilterValue
} from '@fastgpt/web/components/common/TagFilter';
import { getTeamMembers } from '@/web/support/user/team/api';
import { specialProcessors } from '@/pageComponents/admin/audit/processors';
import { defaultMetadataProcessor } from '@/pageComponents/admin/audit/commonProcessor';
import type { AdminAuditListItemType } from '@fastgpt/global/openapi/admin/system/audit/api';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const AuditTable = () => {
  const { t } = useTranslation();
  const labels = useCommonFilterLabels();
  const [memberFilter, setMemberFilter] = useState(createMultiSelectFilter<string>());
  const [eventFilter, setEventFilter] =
    useState<MultiSelectFilterValue<AdminAuditEventEnum>>(createMultiSelectFilter());
  const [auditDetail, setAuditDetail] = useState<AdminAuditListItemType>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 获取团队成员列表
  const { data: members } = usePagination(getTeamMembers, {
    defaultPageSize: 50,
    pageSizeCacheKey: 'audit-members',
    type: 'scroll',
    params: {}
  });

  const memberOptions = useMemo(
    () =>
      members.map((item) => ({
        label: item.memberName,
        value: item.tmbId,
        avatar: item.avatar
      })),
    [members]
  );

  const eventOptions = useMemo(
    () =>
      Object.values(AdminAuditEventEnum).map((event) => ({
        label: t(adminAuditLogMap[event].typeLabel),
        value: event
      })),
    [t]
  );

  const processMetadataByEvent = useCallback(
    (event: string, metadata: any) => {
      const defaultFormat = defaultMetadataProcessor(metadata, t);
      const specialFormat = specialProcessors[event as AdminAuditEventEnum]?.(defaultFormat, t);
      return specialFormat || defaultFormat;
    },
    [t]
  );

  // 构建API参数
  const apiParams = useMemo(() => {
    return {
      tmbIds: toMultiSelectFilterQuery(memberFilter),
      events: toMultiSelectFilterQuery(eventFilter)
    };
  }, [eventFilter, memberFilter]);

  const {
    data: auditLogs,
    isLoading,
    Pagination,
    total,
    pageSize
  } = usePagination(getOperationLogs, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'audit-operation-logs',
    params: apiParams,
    refreshDeps: [apiParams],
    scrollContainerRef
  });

  return (
    <BoxPageRoot display={'flex'} flexDirection={'column'} h={'100%'} p={0}>
      <Flex
        h={'64px'}
        flexShrink={0}
        px={6}
        alignItems={'center'}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
        gap={3}
        wrap="wrap"
      >
        <Box as={'h1'} {...accountTitleTextStyles}>
          审计日志
        </Box>
        <Flex ml={'auto'} alignItems={'center'} gap={2} wrap="wrap">
          <MultiSelectFilter
            title="操作人员"
            value={memberFilter}
            onChange={setMemberFilter}
            options={memberOptions}
            labels={labels}
            showSearch
          />
          <MultiSelectFilter
            title="操作类型"
            value={eventFilter}
            onChange={setEventFilter}
            options={eventOptions}
            labels={labels}
            showSearch
          />
        </Flex>
      </Flex>
      <FixedTableContainer
        ref={scrollContainerRef}
        position={'relative'}
        h={'100%'}
        maxH={'none'}
        px={[4, 6]}
        py={6}
        footer={
          total > pageSize ? (
            <Flex mt={3} justifyContent={'center'}>
              <Pagination />
            </Flex>
          ) : undefined
        }
      >
        <Table minW={'1000px'}>
          <Thead>
            <Tr>
              <Th>
                <Flex direction="row" gap={2}>
                  <Box h="28px" lineHeight="28px" whiteSpace="nowrap">
                    操作人员
                  </Box>
                </Flex>
              </Th>
              <Th>操作时间</Th>
              <Th>
                <Flex direction="row" gap={2}>
                  <Box h="28px" lineHeight="28px" whiteSpace="nowrap">
                    操作类型
                  </Box>
                </Flex>
              </Th>
              <Th>操作内容</Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {auditLogs.map((log) => {
              const i18nData = adminAuditLogMap[log.event as AdminAuditEventEnum];
              const metadata = processMetadataByEvent(log.event, { ...log.metadata });

              return i18nData ? (
                <Tr key={log._id}>
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
                  <Td>{t(i18nData.content as any, metadata)}</Td>
                </Tr>
              ) : null;
            })}
          </Tbody>
        </Table>
        {!isLoading && auditLogs.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              暂无审计记录～
            </Box>
          </Flex>
        )}
      </FixedTableContainer>
      {auditDetail && (
        <AuditDetailModal log={auditDetail} onClose={() => setAuditDetail(undefined)} />
      )}
    </BoxPageRoot>
  );
};

function AuditDetailModal({ log, onClose }: { log: AdminAuditListItemType; onClose: () => void }) {
  const { t } = useTranslation();
  const i18nData = adminAuditLogMap[log.event as AdminAuditEventEnum];
  const metadata = defaultMetadataProcessor(log.metadata, t);

  return (
    <MyModal title={'审计详情'} maxW={'90vw'} w={'100%'} isOpen={true} onClose={onClose}>
      <Flex flexDir={'column'} gap={'1rem'}>
        <Flex alignItems={'center'} justify={'space-between'}>
          <FormLabel flex={'0 0 120px'}>{'操作人员:'}</FormLabel>
          <Box>
            <UserBox
              sourceMember={log.sourceMember}
              fontSize="sm"
              avatarSize="1.5rem"
              spacing={1}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} justify={'space-between'}>
          <FormLabel flex={'0 0 120px'}>{'操作时间:'}</FormLabel>
          <Box>{formatTime2YMDHMS(log.timestamp)}</Box>
        </Flex>
        <Flex alignItems={'center'} justify={'space-between'}>
          <FormLabel flex={'0 0 120px'}>{'操作类型:'}</FormLabel>
          <Box>{i18nData ? t(i18nData.typeLabel) : log.event}</Box>
        </Flex>
        <Box>
          <FormLabel flex={'0 0 120px'}>{'操作内容:'}</FormLabel>
          <Box
            borderRadius={'lg'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            bg={'myGray.100'}
            p={2}
            maxH={'300px'}
            overflowY={'auto'}
          >
            {i18nData ? t(i18nData.content as any, metadata) : JSON.stringify(log.metadata)}
          </Box>
        </Box>

        {log.metadata && Object.keys(log.metadata).length > 0 && (
          <Box>
            <FormLabel flex={'0 0 120px'}>{'METADATA:'}</FormLabel>
            <Box
              borderRadius={'lg'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              bg={'myGray.100'}
              p={2}
              maxH={'300px'}
              overflowY={'auto'}
              whiteSpace={'pre'}
            >
              {JSON.stringify(log.metadata, null, 2)}
            </Box>
          </Box>
        )}
      </Flex>
    </MyModal>
  );
}

export default AuditTable;
