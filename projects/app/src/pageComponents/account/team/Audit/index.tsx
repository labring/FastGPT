import {
  Box,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  HStack
} from '@chakra-ui/react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getOperationLogs } from '@/web/support/user/team/operantionLog/api';
import { auditLogMap } from '@fastgpt/web/support/user/audit/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getTeamMembers } from '@/web/support/user/team/api';
import { specialProcessors } from './processors';
import { defaultMetadataProcessor } from './processors/commonProcessor';

function AuditLog({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useState<{
    tmbIds?: string[];
    events?: AuditEventEnum[];
  }>({});

  const { data: members, ScrollData } = useScrollPagination(getTeamMembers, {});
  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <HStack spacing={1} color={'myGray.500'}>
            <Avatar src={item.avatar} w={'1.2rem'} mr={1} rounded={'full'} />
            <Box>{item.memberName}</Box>
          </HStack>
        ),
        value: item.tmbId
      })),
    [members]
  );

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

  const {
    data: auditLog = [],
    isLoading: loadingLogs,
    ScrollData: LogScrollData
  } = useScrollPagination(getOperationLogs, {
    pageSize: 20,
    refreshDeps: [searchParams],
    params: searchParams
  });

  const {
    value: selectedTmbIds,
    setValue: setSelectedTmbIds,
    isSelectAll: isSelectAllTmb,
    setIsSelectAll: setIsSelectAllTmb
  } = useMultipleSelect<string>(
    tmbList.map((item) => item.value),
    true
  );

  const {
    value: selectedEvents,
    setValue: setSelectedEvents,
    isSelectAll: isSelectAllEvent,
    setIsSelectAll: setIsSelectAllEvent
  } = useMultipleSelect<AuditEventEnum>(
    eventOptions.map((item) => item.value),
    true
  );

  useEffect(() => {
    setSearchParams({
      ...(isSelectAllTmb ? {} : { tmbIds: selectedTmbIds }),
      ...(isSelectAllEvent ? {} : { events: selectedEvents })
    });
  }, [selectedTmbIds, selectedEvents, isSelectAllTmb, isSelectAllEvent]);

  const isLoading = loadingLogs;

  return (
    <>
      <Flex justify={'flex-start'} align={'center'} pb={'1rem'} gap={2} wrap="wrap">
        {Tabs}
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
            {t('account_team:log_user')}
          </Box>
          <Box>
            <MultipleSelect<string>
              list={tmbList}
              value={selectedTmbIds}
              onSelect={(val) => {
                setSelectedTmbIds(val as string[]);
              }}
              itemWrap={false}
              height={'32px'}
              bg={'myGray.50'}
              w={'160px'}
              ScrollData={ScrollData}
              isSelectAll={isSelectAllTmb}
              setIsSelectAll={setIsSelectAllTmb}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
            {t('account_team:log_type')}
          </Box>
          <Box>
            <MultipleSelect
              list={eventOptions}
              value={selectedEvents}
              onSelect={setSelectedEvents}
              isSelectAll={isSelectAllEvent}
              setIsSelectAll={setIsSelectAllEvent}
              itemWrap={false}
              height={'32px'}
              bg={'myGray.50'}
              w={'160px'}
            />
          </Box>
        </Flex>
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
                {auditLog?.map((log) => {
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
                      <Td>{t(i18nData.content as any, metadata)}</Td>
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

export default AuditLog;
