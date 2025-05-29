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
  HStack
} from '@chakra-ui/react';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getOperationLogs } from '@/web/support/user/team/operantionLog/api';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { operationLogMap } from '@fastgpt/service/support/operationLog/constants';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getTeamMembers } from '@/web/support/user/team/api';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';

function OperationLogTable({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useState<{
    tmbIds?: string[];
    events?: OperationLogEventEnum[];
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
      Object.values(OperationLogEventEnum).map((event) => ({
        label: t(operationLogMap[event].typeLabel),
        value: event
      })),
    [t]
  );

  const processAssignPermissionMetadata = (metadata: {
    name?: string;
    objectName: string;
    permission: string;
  }) => {
    const permissionValue = parseInt(metadata.permission, 10);
    const permission = new TeamPermission({ per: permissionValue });

    return {
      ...metadata,
      appCreate: permission.hasAppCreatePer ? '✔' : '✘',
      datasetCreate: permission.hasDatasetCreatePer ? '✔' : '✘',
      apiKeyCreate: permission.hasApikeyCreatePer ? '✔' : '✘',
      manage: permission.hasManagePer ? '✔' : '✘'
    };
  };

  const processUpdateAppCollaboratorMetadata = (metadata: {
    name?: string;
    appName: string;
    appType: string;
    tmbList: string[];
    groupList: string[];
    orgList: string[];
    permission: string;
  }) => {
    const permissionValue = parseInt(metadata.permission, 10);
    const permission = new AppPermission({ per: permissionValue });
    return {
      ...metadata,
      appType: t(metadata.appType as any),
      readPermission: permission.hasReadPer ? '✔' : '✘',
      writePermission: permission.hasWritePer ? '✔' : '✘',
      managePermission: permission.hasManagePer ? '✔' : '✘'
    };
  };

  const processCreateAppMetadata = (metadata: {
    name?: string;
    appName: string;
    appType: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any)
    };
  };

  const processUpdateAppInfoMetadata = (metadata: {
    name?: string;
    appName: string;
    newItemNames: string[] | string;
    newItemValues: (string | undefined)[] | string;
    appType: string;
  }) => {
    const newItemNames = Array.isArray(metadata.newItemNames)
      ? metadata.newItemNames.map((itemName: string) => t(itemName as any)).join(',')
      : metadata.newItemNames
        ? metadata.newItemNames
            .split(',')
            .map((itemName: string) => t(itemName as any))
            .join(',')
        : '';
    return {
      ...metadata,
      newItemNames: newItemNames,
      appType: t(metadata.appType as any)
    };
  };

  const processMoveAppMetadata = (metadata: {
    name?: string;
    appName: string;
    targetFolderName: string;
    appType: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any)
    };
  };

  const processDeleteAppMetadata = (metadata: {
    name?: string;
    appName: string;
    appType: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any)
    };
  };

  const processDeleteAppCollaboratorMetadata = (metadata: {
    name?: string;
    appName: string;
    appType: string;
    itemName: string;
    itemValueName: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any),
      itemName: t(metadata.itemName as any)
    };
  };

  const processTransferAppOwnershipMetadata = (metadata: {
    name?: string;
    appName: string;
    appType: string;
    oldOwnerName: string;
    newOwnerName: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any)
    };
  };

  const processCreateAppCopyMetadata = (metadata: {
    name?: string;
    appName: string;
    appType: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any)
    };
  };

  const processUpdatePublishAppMetadata = (metadata: {
    name?: string;
    operationName: string;
    appName: string;
    appType: string;
  }) => {
    return {
      ...metadata,
      operationName: t(metadata.operationName as any),
      appType: t(metadata.appType as any)
    };
  };

  const processCreateAppPublishChannelMetadata = (metadata: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any)
    };
  };

  const processUpdateAppPublishChannelMetadata = (metadata: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any)
    };
  };

  const processDeleteAppPublishChannelMetadata = (metadata: {
    name?: string;
    appName: string;
    channelName: string;
    appType: string;
  }) => {
    return {
      ...metadata,
      appType: t(metadata.appType as any),
      channelName: t(metadata.channelName as any)
    };
  };

  const processUpdateDatasetCollaboratorMetadata = (metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
    tmbList: string[];
    groupList: string[];
    orgList: string[];
    permission: string;
  }) => {
    const permissionValue = parseInt(metadata.permission, 10);
    const permission = new AppPermission({ per: permissionValue });
    return {
      ...metadata,
      readPermission: permission.hasReadPer ? '✔' : '✘',
      writePermission: permission.hasWritePer ? '✔' : '✘',
      managePermission: permission.hasManagePer ? '✔' : '✘',
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processDeleteDatasetCollaboratorMetadata = (metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
    itemName: string;
    itemValueName: string;
  }) => {
    return {
      ...metadata,
      itemName: t(metadata.itemName as any),
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processCreateDatasetMetadata = (metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processUpdateDatasetMetadata = (metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processDeleteDatasetMetadata = (metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processMoveDatasetMetadata = (metadata: {
    name?: string;
    datasetName: string;
    targetFolderName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processExportDatasetMetadata = (metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processTransferDatasetOwnershipMetadata = (metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
    oldOwnerName: string;
    newOwnerName: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processCreateCollectionMetadata = (metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processUpdateCollectionMetadata = (metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processDeleteCollectionMetadata = (metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processRetrainCollectionMetadata = (metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processCreateDataMetadata = (metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processUpdateDataMetadata = (metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processDeleteDataMetadata = (metadata: {
    name?: string;
    collectionName: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  const processSearchTestMetadata = (metadata: {
    name?: string;
    datasetName: string;
    datasetType: string;
  }) => {
    return {
      ...metadata,
      datasetType: t(metadata.datasetType as any)
    };
  };

  type MetadataProcessor = (metadata: any) => any;

  const metadataProcessorMap: Record<OperationLogEventEnum, MetadataProcessor> = useMemo(
    () => ({
      [OperationLogEventEnum.ASSIGN_PERMISSION]: processAssignPermissionMetadata,
      [OperationLogEventEnum.CREATE_APP]: processCreateAppMetadata,
      [OperationLogEventEnum.UPDATE_APP_INFO]: processUpdateAppInfoMetadata,
      [OperationLogEventEnum.MOVE_APP]: processMoveAppMetadata,
      [OperationLogEventEnum.DELETE_APP]: processDeleteAppMetadata,
      [OperationLogEventEnum.UPDATE_APP_COLLABORATOR]: processUpdateAppCollaboratorMetadata,
      [OperationLogEventEnum.DELETE_APP_COLLABORATOR]: processDeleteAppCollaboratorMetadata,
      [OperationLogEventEnum.TRANSFER_APP_OWNERSHIP]: processTransferAppOwnershipMetadata,
      [OperationLogEventEnum.CREATE_APP_COPY]: processCreateAppCopyMetadata,
      [OperationLogEventEnum.UPDATE_PUBLISH_APP]: processUpdatePublishAppMetadata,
      [OperationLogEventEnum.CREATE_APP_PUBLISH_CHANNEL]: processCreateAppPublishChannelMetadata,
      [OperationLogEventEnum.UPDATE_APP_PUBLISH_CHANNEL]: processUpdateAppPublishChannelMetadata,
      [OperationLogEventEnum.DELETE_APP_PUBLISH_CHANNEL]: processDeleteAppPublishChannelMetadata,
      [OperationLogEventEnum.UPDATE_DATASET_COLLABORATOR]: processUpdateDatasetCollaboratorMetadata,
      [OperationLogEventEnum.DELETE_DATASET_COLLABORATOR]: processDeleteDatasetCollaboratorMetadata,
      [OperationLogEventEnum.CREATE_DATASET]: processCreateDatasetMetadata,
      [OperationLogEventEnum.UPDATE_DATASET]: processUpdateDatasetMetadata,
      [OperationLogEventEnum.DELETE_DATASET]: processDeleteDatasetMetadata,
      [OperationLogEventEnum.MOVE_DATASET]: processMoveDatasetMetadata,
      [OperationLogEventEnum.EXPORT_DATASET]: processExportDatasetMetadata,
      [OperationLogEventEnum.LOGIN]: (metadata: any) => metadata,
      [OperationLogEventEnum.CREATE_INVITATION_LINK]: (metadata: any) => metadata,
      [OperationLogEventEnum.JOIN_TEAM]: (metadata: any) => metadata,
      [OperationLogEventEnum.CHANGE_MEMBER_NAME]: (metadata: any) => metadata,
      [OperationLogEventEnum.KICK_OUT_TEAM]: (metadata: any) => metadata,
      [OperationLogEventEnum.RECOVER_TEAM_MEMBER]: (metadata: any) => metadata,
      [OperationLogEventEnum.CREATE_DEPARTMENT]: (metadata: any) => metadata,
      [OperationLogEventEnum.CHANGE_DEPARTMENT]: (metadata: any) => metadata,
      [OperationLogEventEnum.DELETE_DEPARTMENT]: (metadata: any) => metadata,
      [OperationLogEventEnum.RELOCATE_DEPARTMENT]: (metadata: any) => metadata,
      [OperationLogEventEnum.CREATE_GROUP]: (metadata: any) => metadata,
      [OperationLogEventEnum.DELETE_GROUP]: (metadata: any) => metadata,
      [OperationLogEventEnum.CREATE_APP_FOLDER]: (metadata: any) => metadata,
      [OperationLogEventEnum.EXPORT_APP_CHAT_LOG]: (metadata: any) => metadata,
      [OperationLogEventEnum.TRANSFER_DATASET_OWNERSHIP]: processTransferDatasetOwnershipMetadata,
      [OperationLogEventEnum.CREATE_DATASET_FOLDER]: (metadata: any) => metadata,
      [OperationLogEventEnum.CREATE_COLLECTION]: processCreateCollectionMetadata,
      [OperationLogEventEnum.UPDATE_COLLECTION]: processUpdateCollectionMetadata,
      [OperationLogEventEnum.DELETE_COLLECTION]: processDeleteCollectionMetadata,
      [OperationLogEventEnum.RETRAIN_COLLECTION]: processRetrainCollectionMetadata,
      [OperationLogEventEnum.CREATE_DATA]: processCreateDataMetadata,
      [OperationLogEventEnum.UPDATE_DATA]: processUpdateDataMetadata,
      [OperationLogEventEnum.DELETE_DATA]: processDeleteDataMetadata,
      [OperationLogEventEnum.SEARCH_TEST]: processSearchTestMetadata,
      [OperationLogEventEnum.CHANGE_PASSWORD]: (metadata: any) => metadata,
      [OperationLogEventEnum.CHANGE_NOTIFICATION_SETTINGS]: (metadata: any) => metadata,
      [OperationLogEventEnum.CHANGE_MEMBER_NAME_ACCOUNT]: (metadata: any) => metadata,
      [OperationLogEventEnum.PURCHASE_PLAN]: (metadata: any) => metadata,
      [OperationLogEventEnum.EXPORT_BILL_RECORDS]: (metadata: any) => metadata,
      [OperationLogEventEnum.CREATE_INVOICE]: (metadata: any) => metadata,
      [OperationLogEventEnum.SET_INVOICE_HEADER]: (metadata: any) => metadata,
      [OperationLogEventEnum.CREATE_API_KEY]: (metadata: any) => metadata,
      [OperationLogEventEnum.UPDATE_API_KEY]: (metadata: any) => metadata,
      [OperationLogEventEnum.DELETE_API_KEY]: (metadata: any) => metadata
    }),
    []
  );

  const processMetadataByEvent = (event: string, metadata: any) => {
    const processor = metadataProcessorMap[event as OperationLogEventEnum];
    return processor ? processor(metadata) : metadata;
  };

  const {
    data: operationLogs = [],
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
  } = useMultipleSelect<OperationLogEventEnum>(
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
                {operationLogs?.map((log) => {
                  const i18nData = operationLogMap[log.event];
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
