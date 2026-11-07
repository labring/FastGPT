import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { Box, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import Link from '@fastgpt/web/components/common/Link';
import { useMemo, useRef, useState } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getOperationLogs } from '@/web/support/user/team/operantionLog/api';
import { auditLogMap } from '@fastgpt/web/support/user/audit/constants';
import {
  TeamAuditEventList,
  type TeamAuditEvent
} from '@fastgpt/global/support/user/audit/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import UserBox from '@fastgpt/web/components/common/UserBox';
import {
  MultiSelectFilter,
  createMultiSelectFilter,
  toMultiSelectFilterQuery,
  type MultiSelectFilterValue,
  useCommonFilterLabels
} from '@fastgpt/web/components/common/TagFilter';
import { processAuditMetadata } from './processors';
import TeamMemberFilter from '@/components/support/user/TeamMemberFilter';
import { AppTypeEnum, ToolTypeList } from '@fastgpt/global/core/app/constants';

function AuditLog({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useSafeTranslation();
  const labels = useCommonFilterLabels();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [memberFilter, setMemberFilter] = useState(createMultiSelectFilter());
  const [eventFilter, setEventFilter] =
    useState<MultiSelectFilterValue<TeamAuditEvent>>(createMultiSelectFilter());

  // 筛选项包含成员事件与知识库事件；只列出 auditLogMap 中存在文案的事件，避免历史枚举缺文案时报错
  const eventOptions = useMemo(
    () =>
      TeamAuditEventList.filter((event) => auditLogMap[event]).map((event) => ({
        label: t(auditLogMap[event].typeLabel),
        value: event
      })),
    [t]
  );

  const searchParams = useMemo(
    () => ({
      tmbIds: toMultiSelectFilterQuery(memberFilter),
      events: toMultiSelectFilterQuery(eventFilter)
    }),
    [eventFilter, memberFilter]
  );

  const {
    data: auditLog = [],
    isLoading: loadingLogs,
    total,
    pageSize,
    Pagination
  } = usePagination(getOperationLogs, {
    defaultPageSize: 20,
    pageSizeOptions: [20, 50, 100, 200],
    pageSizeCacheKey: 'account-team-audit',
    refreshDeps: [searchParams],
    params: searchParams,
    scrollContainerRef
  });

  const isLoading = loadingLogs;

  return (
    <>
      <Flex
        px={6}
        justify={'flex-start'}
        align={['stretch', 'center']}
        flexDirection={['column', 'row']}
        pb={'1rem'}
      >
        <Box w={['100%', 'auto']}>{Tabs}</Box>
        <Flex
          mt={[3, 0]}
          ml={[0, 'auto']}
          w={['100%', 'auto']}
          flexDirection={['column', 'row']}
          alignItems={'center'}
          justifyContent={['flex-end', 'initial']}
          gap={2}
          wrap={'wrap'}
        >
          <TeamMemberFilter
            title={t('account_team:log_user')}
            value={memberFilter}
            onChange={setMemberFilter}
          />
          <MultiSelectFilter
            title={t('account_team:log_type')}
            value={eventFilter}
            onChange={setEventFilter}
            options={eventOptions}
            labels={labels}
            showSearch
          />
        </Flex>
      </Flex>

      <MyBox
        isLoading={isLoading}
        flex={['0 0 auto', '1 0 0']}
        h={['auto', 0]}
        minH={0}
        display={'flex'}
        flexDirection={'column'}
      >
        <FixedTableContainer
          maxH="none"
          ref={scrollContainerRef}
          px={4}
          flex={['0 0 auto', '1 0 0']}
          h={['60dvh', 0]}
          minH={0}
          fontSize={'sm'}
          footer={
            <>
              {total > pageSize && (
                <Flex flexShrink={0} mt={3} px={6} justifyContent={'center'}>
                  <Pagination />
                </Flex>
              )}
            </>
          }
        >
          <Table w={'100%'} minW={['900px', '100%']} sx={{ tableLayout: 'fixed' }}>
            <Thead>
              <Tr bgColor={'white !important'}>
                <Th w={'16%'} borderLeftRadius="6px" bgColor="myGray.100">
                  {t('account_team:log_user')}
                </Th>
                <Th w={'18%'} bgColor="myGray.100">
                  {t('account_team:log_resource')}
                </Th>
                <Th w={'18%'} bgColor="myGray.100">
                  {t('account_team:log_time')}
                </Th>
                <Th w={'18%'} bgColor="myGray.100">
                  {t('account_team:log_type')}
                </Th>
                <Th w={'30%'} bgColor="myGray.100">
                  {t('account_team:log_details')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {auditLog.map((log) => {
                const i18nData = auditLogMap[log.event];
                const metadata = processAuditMetadata({
                  event: log.event,
                  metadata: log.metadata,
                  t
                });

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
                    <Td whiteSpace="normal" overflowWrap="anywhere">
                      {log.resources?.map((resource) => {
                        const target = resource.appId
                          ? {
                              id: resource.appId,
                              path: '/app/detail',
                              key: 'appId',
                              // 依据类型快照分类，避免使用本地化 metadata 文案判断；旧记录默认应用。
                              label:
                                resource.appType &&
                                [
                                  ...ToolTypeList,
                                  AppTypeEnum.toolFolder,
                                  AppTypeEnum.httpPlugin,
                                  AppTypeEnum.tool
                                ].includes(resource.appType)
                                  ? t('account_team:resource_tool')
                                  : t('account_team:resource_app')
                            }
                          : resource.skillId
                            ? {
                                id: resource.skillId,
                                path: '/skill/detail',
                                key: 'skillId',
                                label: t('account_team:resource_skill')
                              }
                            : resource.datasetId
                              ? {
                                  id: resource.datasetId,
                                  path: '/dataset/detail',
                                  key: 'datasetId',
                                  label: t('account_team:resource_dataset')
                                }
                              : undefined;
                        return target ? (
                          <Box key={`${target.key}:${target.id}`}>
                            <Link
                              color="primary.600"
                              href={`${target.path}?${target.key}=${encodeURIComponent(target.id)}`}
                            >
                              {target.label} · {target.id.slice(-8)}
                            </Link>
                          </Box>
                        ) : null;
                      })}
                    </Td>
                    <Td>{formatTime2YMDHMS(log.timestamp)}</Td>
                    <Td>{t(i18nData.typeLabel)}</Td>
                    <Td
                      whiteSpace={['nowrap', 'normal']}
                      wordBreak={['normal', 'break-word']}
                      overflowWrap={['normal', 'anywhere']}
                    >
                      {Object.keys(log.metadata ?? {}).length
                        ? t(i18nData.content as any, metadata)
                        : '-'}
                    </Td>
                  </Tr>
                ) : null;
              })}
            </Tbody>
          </Table>
        </FixedTableContainer>
      </MyBox>
    </>
  );
}

export default AuditLog;
