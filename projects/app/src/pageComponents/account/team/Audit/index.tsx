import { Box, Flex, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useMemo, useCallback, useRef, useState } from 'react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getOperationLogs } from '@/web/support/user/team/operantionLog/api';
import { auditLogMap } from '@fastgpt/web/support/user/audit/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import UserBox from '@fastgpt/web/components/common/UserBox';
import {
  MultiSelectFilter,
  createMultiSelectFilter,
  toMultiSelectFilterQuery,
  type MultiSelectFilterValue,
  useCommonFilterLabels
} from '@fastgpt/web/components/common/TagFilter';
import { specialProcessors } from './processors';
import { defaultMetadataProcessor } from './processors/commonProcessor';
import TeamMemberFilter from '@/components/support/user/TeamMemberFilter';
function AuditLog({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useClientTranslation(['account_team', 'user']);
  const labels = useCommonFilterLabels();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [memberFilter, setMemberFilter] = useState(createMultiSelectFilter());
  const [eventFilter, setEventFilter] =
    useState<MultiSelectFilterValue<AuditEventEnum>>(createMultiSelectFilter());

  const eventOptions = useMemo(
    () =>
      Object.values(AuditEventEnum).map((event) => ({
        label: t(auditLogMap[event].typeLabel),
        value: event
      })),
    [t]
  );

  const processMetadataByEvent = useCallback(
    (event: string, metadata: any) => {
      const defaultFormat = defaultMetadataProcessor(metadata, t);
      const specialFormat = specialProcessors[event as AuditEventEnum]?.(defaultFormat, t);
      return specialFormat || defaultFormat;
    },
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
    defaultPageSize: 100,
    pageSizeOptions: [50, 100, 200],
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
        <TableContainer
          ref={scrollContainerRef}
          px={6}
          flex={['0 0 auto', '1 0 0']}
          h={['auto', 0]}
          minH={0}
          overflowX={['auto', 'hidden']}
          overflowY={['visible', 'auto']}
          fontSize={'sm'}
        >
          <Table w={'100%'} minW={['900px', '100%']} sx={{ tableLayout: 'fixed' }}>
            <Thead>
              <Tr bgColor={'white !important'}>
                <Th w={'18%'} borderLeftRadius="6px" bgColor="myGray.100">
                  {t('account_team:log_user')}
                </Th>
                <Th w={'20%'} bgColor="myGray.100">
                  {t('account_team:log_time')}
                </Th>
                <Th w={'18%'} bgColor="myGray.100">
                  {t('account_team:log_type')}
                </Th>
                <Th w={'44%'} bgColor="myGray.100">
                  {t('account_team:log_details')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {auditLog.map((log) => {
                const i18nData = auditLogMap[log.event];
                const metadata = processMetadataByEvent(log.event, { ...log.metadata });

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
                    <Td
                      whiteSpace={['nowrap', 'normal']}
                      wordBreak={['normal', 'break-word']}
                      overflowWrap={['normal', 'anywhere']}
                    >
                      {t(i18nData.content as any, metadata)}
                    </Td>
                  </Tr>
                ) : null;
              })}
            </Tbody>
          </Table>
        </TableContainer>
        {total > pageSize && (
          <Flex flexShrink={0} mt={3} px={6} justifyContent={'center'}>
            <Pagination />
          </Flex>
        )}
      </MyBox>
    </>
  );
}

export default AuditLog;
