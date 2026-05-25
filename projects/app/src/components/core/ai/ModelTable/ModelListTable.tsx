import {
  Box,
  Button,
  Checkbox,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyTag from '@fastgpt/web/components/common/Tag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EllipsisTooltip from '@fastgpt/web/components/common/EllipsisTooltip';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { getModelCollaborators, updateModelCollaborators } from '@/web/common/system/api';
import { getDatasetsWithChildren } from '@/web/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { Dispatch, SetStateAction } from 'react';
import { useState, useEffect, useMemo } from 'react';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import type {
  ModelTabType,
  I18nT,
  ModelRow,
  OpenTrainModelHandler,
  TeamPermission,
  TrainDetailModel
} from './types';
import { modelTableTabValues } from './types';
import { hasErrorTrainTask, hasRunningTrainTask } from './helpers/trainStatus';

export type ModelListTableProps = {
  t: I18nT;
  tabType: ModelTabType;
  modelList: ModelRow[];
  permissionConfig: boolean;
  hasManagePer: boolean;
  userPermission: TeamPermission;
  selectedItems: ModelRow[];
  toggleSelect: (item: ModelRow) => void;
  isSelected: (item: ModelRow) => boolean;
  isSelecteAll: boolean;
  selectAllTrigger: () => void;
  trainTaskCountSortOrder?: 'asc' | 'desc';
  toggleTrainTaskCountSort: () => void;
  trainTimeSortOrder?: 'asc' | 'desc';
  toggleTrainTimeSort?: () => void;
  handleOpenTrainDrawer: OpenTrainModelHandler;
  setTrainDetailDrawer: Dispatch<SetStateAction<TrainDetailModel | null>>;
};

type DatasetInfo = {
  datasetNameMap: Record<string, string>;
  allDatasetIds: string[];
};

type ModelTableRowProps = {
  item: ModelRow;
  tabType: ModelTabType;
  t: I18nT;
  permissionConfig: boolean;
  hasManagePer: boolean;
  userPermission: TeamPermission;
  toggleSelect: (item: ModelRow) => void;
  isSelected: (item: ModelRow) => boolean;
  handleOpenTrainDrawer: OpenTrainModelHandler;
  setTrainDetailDrawer: Dispatch<SetStateAction<TrainDetailModel | null>>;
  datasetInfo: DatasetInfo;
};

type TableActionCellProps = {
  item: ModelRow;
  tabType: ModelTabType;
  t: I18nT;
  permissionConfig: boolean;
  hasManagePer: boolean;
  userPermission: TeamPermission;
  handleOpenTrainDrawer: OpenTrainModelHandler;
};

const ModelListTable = ({
  t,
  tabType,
  modelList,
  permissionConfig,
  hasManagePer,
  userPermission,
  toggleSelect,
  isSelected,
  isSelecteAll,
  selectAllTrigger,
  trainTaskCountSortOrder,
  toggleTrainTaskCountSort,
  trainTimeSortOrder,
  toggleTrainTimeSort,
  handleOpenTrainDrawer,
  setTrainDetailDrawer
}: ModelListTableProps) => {
  const showTrainedModelColumns = tabType === modelTableTabValues.custom;
  const showTrainTaskColumn = tabType === modelTableTabValues.base;

  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo>({
    datasetNameMap: {},
    allDatasetIds: []
  });

  const { runAsync: loadDatasets } = useRequest(
    async () => {
      const datasets = await getDatasetsWithChildren({ parentId: null });

      type DatasetTreeItem = DatasetListItemType & {
        children?: DatasetTreeItem[];
      };

      const reduceDatasets = (items: DatasetTreeItem[], acc: DatasetInfo): DatasetInfo => {
        items.forEach((dataset) => {
          if (dataset.type === DatasetTypeEnum.folder) {
            if (dataset.children?.length) {
              reduceDatasets(dataset.children as DatasetTreeItem[], acc);
            }
            return;
          }

          acc.allDatasetIds.push(dataset._id);
          acc.datasetNameMap[dataset._id] = dataset.name;

          if (dataset.children?.length) {
            reduceDatasets(dataset.children as DatasetTreeItem[], acc);
          }
        });

        return acc;
      };

      return reduceDatasets(datasets as DatasetTreeItem[], {
        datasetNameMap: {},
        allDatasetIds: []
      });
    },
    {
      errorToast: '',
      onSuccess: (res) => {
        setDatasetInfo(res);
      }
    }
  );

  useEffect(() => {
    if (showTrainedModelColumns) {
      loadDatasets();
    }
  }, [showTrainedModelColumns, loadDatasets]);

  return (
    <TableContainer mt={4} flex={'1 0 0'} h={0} overflowY={'auto'}>
      <Table>
        <Thead>
          <Tr color={'myGray.600'}>
            <Th fontSize={'xs'} w={showTrainedModelColumns ? '180px' : undefined}>
              <HStack>
                {permissionConfig && hasManagePer && (
                  <Checkbox mr={1} isChecked={isSelecteAll} onChange={selectAllTrigger}></Checkbox>
                )}
                <Box>{t('common:model.name')}</Box>
              </HStack>
            </Th>
            <Th fontSize={'xs'} w={showTrainedModelColumns ? '132px' : undefined}>
              {t('common:model.model_type')}
            </Th>
            {showTrainedModelColumns ? (
              <>
                <Th
                  fontSize={'xs'}
                  w={'250px'}
                  cursor={'pointer'}
                  userSelect={'none'}
                  onClick={() => toggleTrainTimeSort?.()}
                >
                  <HStack spacing={1}>
                    <Box>{t('account_model:train_detail_train_time')}</Box>
                    {trainTimeSortOrder ? (
                      <MyIcon
                        name={
                          trainTimeSortOrder === 'asc' ? 'common/table/asc' : 'common/table/desc'
                        }
                        w={'12px'}
                        cursor={'pointer'}
                        color={'primary.600'}
                      />
                    ) : (
                      <MyIcon
                        name={'common/table/sort'}
                        w={'12px'}
                        cursor={'pointer'}
                        color={'myGray.400'}
                        _hover={{ color: 'primary.600' }}
                      />
                    )}
                  </HStack>
                </Th>
                <Th fontSize={'xs'} w={'150px'}>
                  {t('account_model:train_detail_trainer')}
                </Th>
                <Th fontSize={'xs'} w={'80px'}>
                  {t('account_model:train_data')}
                </Th>
              </>
            ) : (
              <Th fontSize={'xs'}>{t('common:model.billing')}</Th>
            )}
            {showTrainTaskColumn && (
              <Th
                fontSize={'xs'}
                cursor={'pointer'}
                userSelect={'none'}
                onClick={toggleTrainTaskCountSort}
              >
                <HStack spacing={1}>
                  <Box>{t('account_model:train_task_count')}</Box>
                  {trainTaskCountSortOrder ? (
                    <MyIcon
                      name={
                        trainTaskCountSortOrder === 'asc' ? 'common/table/asc' : 'common/table/desc'
                      }
                      w={'12px'}
                      cursor={'pointer'}
                      color={'primary.600'}
                    />
                  ) : (
                    <MyIcon
                      name={'common/table/sort'}
                      w={'12px'}
                      cursor={'pointer'}
                      color={'myGray.400'}
                      _hover={{ color: 'primary.600' }}
                    />
                  )}
                </HStack>
              </Th>
            )}
            <Th fontSize={'xs'} w={showTrainedModelColumns ? '240px' : undefined}>
              {t('account_model:action')}
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {modelList.map((item) => (
            <ModelTableRow
              key={item.model}
              item={item}
              tabType={tabType}
              t={t}
              permissionConfig={permissionConfig}
              hasManagePer={hasManagePer}
              userPermission={userPermission}
              toggleSelect={toggleSelect}
              isSelected={isSelected}
              handleOpenTrainDrawer={handleOpenTrainDrawer}
              setTrainDetailDrawer={setTrainDetailDrawer}
              datasetInfo={datasetInfo}
            />
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

const ModelTableRow = ({
  item,
  tabType,
  t,
  permissionConfig,
  hasManagePer,
  userPermission,
  toggleSelect,
  isSelected,
  handleOpenTrainDrawer,
  setTrainDetailDrawer,
  datasetInfo
}: ModelTableRowProps) => {
  const showTrainedModelColumns = tabType === modelTableTabValues.custom;
  const showTrainTaskColumn = tabType === modelTableTabValues.base;
  const trainTaskCount = item.trainTaskSummary?.totalCount || 0;
  const showRunningTask = hasRunningTrainTask(item.trainTaskSummary);
  const showErrorTask = hasErrorTrainTask(item.trainTaskSummary);

  const onClickTrainTaskCell = () => {
    if (trainTaskCount === 0 || !item.trainableModelType) return;
    setTrainDetailDrawer({
      model: item.model,
      name: item.name,
      baseModelType: item.trainableModelType
    });
  };

  const latestTask = useMemo(() => {
    return showTrainedModelColumns ? item.trainTaskSummary?.latestTask : undefined;
  }, [showTrainedModelColumns, item.trainTaskSummary]);

  const trainDatasetDisplay = useMemo(() => {
    if (!showTrainedModelColumns || !latestTask) return '-';

    const currentDatasetIds = Array.from(new Set((latestTask.datasetIds || []).filter(Boolean)));
    const { allDatasetIds, datasetNameMap } = datasetInfo;

    if (
      allDatasetIds.length > 0 &&
      currentDatasetIds.length === allDatasetIds.length &&
      allDatasetIds.every((datasetId) => currentDatasetIds.includes(datasetId))
    ) {
      return t('account_model:all_datasets');
    }

    const names = currentDatasetIds
      .map((datasetId) => datasetNameMap[datasetId])
      .filter((name): name is string => Boolean(name));

    if (names.length > 0) {
      return names.join('、');
    }

    return '-';
  }, [showTrainedModelColumns, latestTask, datasetInfo, t]);

  return (
    <Tr _hover={{ bg: 'myGray.50' }}>
      <Td fontSize={'sm'}>
        <HStack>
          {permissionConfig && hasManagePer && (
            <Checkbox
              mr={1}
              isChecked={isSelected(item)}
              onChange={() => toggleSelect(item)}
            ></Checkbox>
          )}
          <Avatar src={item.avatar} w={'1.2rem'} />
          <CopyBox value={item.name} color={'myGray.900'}>
            {item.name}
          </CopyBox>
        </HStack>
      </Td>
      <Td>
        <MyTag colorSchema={item.tagColor as any}>{item.typeLabel}</MyTag>
      </Td>
      {showTrainedModelColumns ? (
        <>
          <Td fontSize={'sm'} color={'myGray.700'}>
            {latestTask?.createTime ? formatTime2YMDHMS(latestTask.createTime) : '-'}
          </Td>
          <Td fontSize={'sm'} color={'myGray.700'}>
            {latestTask?.creatorName || '-'}
          </Td>
          <Td fontSize={'sm'}>
            <EllipsisTooltip label={trainDatasetDisplay} color={'myGray.700'} />
          </Td>
        </>
      ) : (
        <Td fontSize={'sm'}>{item.priceLabel}</Td>
      )}
      {showTrainTaskColumn && (
        <Td
          fontSize={'sm'}
          cursor={trainTaskCount > 0 && item.trainableModelType ? 'pointer' : 'default'}
          onClick={onClickTrainTaskCell}
        >
          {trainTaskCount > 0 ? (
            <HStack spacing={1}>
              <Box
                color={'blue.500'}
                _hover={item.trainableModelType ? { textDecoration: 'underline' } : undefined}
              >
                {trainTaskCount}
              </Box>
              {showErrorTask && (
                <MyTooltip label={t('account_model:has_error_train_task')}>
                  <MyIcon
                    name={'infoRounded'}
                    w={'16px'}
                    h={'16px'}
                    color={'red.500'}
                    cursor={'pointer'}
                  />
                </MyTooltip>
              )}
              {showRunningTask && (
                <MyTooltip label={t('account_model:has_running_train_task')}>
                  <Box
                    cursor={'pointer'}
                    display={'flex'}
                    alignItems={'center'}
                    justifyContent={'center'}
                    sx={{
                      '@keyframes modelTrainTaskSpin': {
                        from: {
                          transform: 'rotate(0deg)'
                        },
                        to: {
                          transform: 'rotate(360deg)'
                        }
                      },
                      animation: 'modelTrainTaskSpin 1s linear infinite'
                    }}
                  >
                    <MyIcon
                      name={'common/running'}
                      w={'16px'}
                      h={'16px'}
                      transform={'scaleX(-1)'}
                    />
                  </Box>
                </MyTooltip>
              )}
            </HStack>
          ) : (
            <Box color={'myGray.500'}>-</Box>
          )}
        </Td>
      )}
      <Td fontSize={'sm'}>
        <ModelTableActionCell
          item={item}
          tabType={tabType}
          t={t}
          permissionConfig={permissionConfig}
          hasManagePer={hasManagePer}
          userPermission={userPermission}
          handleOpenTrainDrawer={handleOpenTrainDrawer}
        />
      </Td>
    </Tr>
  );
};

const ModelTableActionCell = ({
  item,
  tabType,
  t,
  permissionConfig,
  hasManagePer,
  userPermission,
  handleOpenTrainDrawer
}: TableActionCellProps) => {
  const showPermissionButton = permissionConfig && hasManagePer;
  const showTrainButton = tabType === modelTableTabValues.base && !!item.trainableModelType;

  if (!showPermissionButton && !showTrainButton) {
    return null;
  }

  const trainButton = showTrainButton ? (
    <Button
      size={'sm'}
      variant={'whiteBase'}
      fontSize={'12px'}
      onClick={() => handleOpenTrainDrawer(item.trainableModelType!, item.model)}
    >
      {t('account_model:train')}
    </Button>
  ) : null;

  return (
    <HStack spacing={2}>
      {showPermissionButton && (
        <LazyCollaboratorProvider
          selectedHint={t('account_model:model_permission_config_hint')}
          defaultRole={ReadRoleVal}
          onGetCollaboratorList={() => getModelCollaborators(item.model)}
          onUpdateCollaborators={({ collaborators }) =>
            updateModelCollaborators({
              collaborators,
              models: [item.model]
            })
          }
          permission={userPermission}
        >
          {({ onOpenManageModal }) => (
            <Button size={'sm'} variant={'whiteBase'} fontSize={'12px'} onClick={onOpenManageModal}>
              {t('common:permission.Permission')}
            </Button>
          )}
        </LazyCollaboratorProvider>
      )}
      {showTrainButton && (
        <MyTooltip label={t('account_model:base_model_train_tip')}>{trainButton}</MyTooltip>
      )}
    </HStack>
  );
};

export default ModelListTable;
