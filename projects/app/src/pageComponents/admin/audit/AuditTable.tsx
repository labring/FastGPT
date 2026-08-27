'use client';
import BoxCard from '@/components/admin/BoxContainer/Card';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Box,
  HStack,
  FormLabel
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useMemo, useState, useCallback } from 'react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useTranslation } from 'next-i18next';
import { getOperationLogs } from '@/web/admin/audit/api';
import { adminAuditLogMap } from '@fastgpt/web/support/user/audit/constants';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getTeamMembers } from '@/web/support/user/team/api';
import { specialProcessors } from '@/pageComponents/admin/audit/processors';
import { defaultMetadataProcessor } from '@/pageComponents/admin/audit/commonProcessor';
import type { TeamAuditListItemType } from '@fastgpt/global/support/user/audit/type';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const AuditTable = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const [selectedTmbIds, setSelectedTmbIds] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<AdminAuditEventEnum[]>([]);
  const [auditDetail, setAuditDetail] = useState<TeamAuditListItemType>();
  const [isSelectAllTmb, setIsSelectAllTmb] = useState<boolean>(true);
  const [isSelectAllEvent, setIsSelectAllEvent] = useState<boolean>(true);

  // 获取团队成员列表
  const { data: members } = usePagination(getTeamMembers, {
    defaultPageSize: 50,
    pageSizeCacheKey: 'audit-members',
    type: 'scroll',
    params: {}
  });

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
    const params: any = {};

    // 当不是全选状态时，传递筛选参数
    // 如果全不选（数组为空），API会返回空结果
    if (!isSelectAllTmb) {
      params.tmbIds = selectedTmbIds;
    }
    if (!isSelectAllEvent) {
      params.events = selectedEvents;
    }

    return params;
  }, [isSelectAllTmb, selectedTmbIds, isSelectAllEvent, selectedEvents]);

  const {
    data: auditLogs,
    isLoading,
    ScrollData
  } = usePagination(getOperationLogs, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'audit-operation-logs',
    params: apiParams,
    type: 'scroll',
    refreshDeps: [apiParams]
  });

  return (
    <BoxCard display={'flex'} flexDirection={'column'} h={'100%'}>
      <Flex justify={'flex-end'} align={'center'} pb={'1rem'} gap={2} wrap="wrap" mr="2px">
        <HStack pb={4}>
          {isPc && (
            <Box as={'h1'} {...accountTitleTextStyles}>
              审计记录表
            </Box>
          )}
        </HStack>
        <Box flexGrow={1}></Box>

        <Flex alignItems={'center'} gap={2} mr={'2px'}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} whiteSpace="nowrap">
            操作人员
          </Box>
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
            isSelectAll={isSelectAllTmb}
            setIsSelectAll={setIsSelectAllTmb}
          />
        </Flex>
        <Flex alignItems={'center'} gap={2} mr={'2px'}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} whiteSpace="nowrap">
            操作类型
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
      <ScrollData position={'relative'} h={'100%'} overflow={'overlay'}>
        <TableContainer>
          <Table>
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
        </TableContainer>
      </ScrollData>
      {auditDetail && (
        <AuditDetailModal log={auditDetail} onClose={() => setAuditDetail(undefined)} />
      )}
    </BoxCard>
  );
};

function AuditDetailModal({ log, onClose }: { log: TeamAuditListItemType; onClose: () => void }) {
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
