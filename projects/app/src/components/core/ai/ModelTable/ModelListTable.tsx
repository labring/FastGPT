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
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { getModelCollaborators, updateModelCollaborators } from '@/web/common/system/api';
import type { Dispatch, SetStateAction } from 'react';
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
  trainTaskCountSortOrder: 'asc' | 'desc';
  toggleTrainTaskCountSort: () => void;
  handleOpenTrainModel: OpenTrainModelHandler;
  setTrainDetailModel: Dispatch<SetStateAction<TrainDetailModel | null>>;
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
  handleOpenTrainModel: OpenTrainModelHandler;
  setTrainDetailModel: Dispatch<SetStateAction<TrainDetailModel | null>>;
};

type TableActionCellProps = {
  item: ModelRow;
  tabType: ModelTabType;
  t: I18nT;
  permissionConfig: boolean;
  hasManagePer: boolean;
  userPermission: TeamPermission;
  handleOpenTrainModel: OpenTrainModelHandler;
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
  handleOpenTrainModel,
  setTrainDetailModel
}: ModelListTableProps) => {
  const showTrainTaskColumn = tabType === modelTableTabValues.base;

  return (
    <TableContainer mt={5} flex={'1 0 0'} h={0} overflowY={'auto'}>
      <Table>
        <Thead>
          <Tr color={'myGray.600'}>
            <Th fontSize={'xs'}>
              <HStack>
                {permissionConfig && hasManagePer && (
                  <Checkbox mr={1} isChecked={isSelecteAll} onChange={selectAllTrigger}></Checkbox>
                )}
                <Box>{t('common:model.name')}</Box>
              </HStack>
            </Th>
            <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
            <Th fontSize={'xs'}>{t('common:model.billing')}</Th>
            {showTrainTaskColumn && (
              <Th
                fontSize={'xs'}
                cursor={'pointer'}
                userSelect={'none'}
                onClick={toggleTrainTaskCountSort}
              >
                <HStack spacing={1}>
                  <Box>{t('account_model:train_task_count')}</Box>
                  <MyIcon
                    name={'core/chat/chevronSelector'}
                    w={'16px'}
                    color={trainTaskCountSortOrder ? 'primary.600' : undefined}
                    _hover={{ color: 'primary.600' }}
                  />
                </HStack>
              </Th>
            )}
            <Th fontSize={'xs'}>{t('account_model:action')}</Th>
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
              handleOpenTrainModel={handleOpenTrainModel}
              setTrainDetailModel={setTrainDetailModel}
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
  handleOpenTrainModel,
  setTrainDetailModel
}: ModelTableRowProps) => {
  const showTrainTaskColumn = tabType === modelTableTabValues.base;
  const trainTaskCount = item.trainTaskList?.length || 0;
  const showRunningTask = hasRunningTrainTask(item.trainTaskList);
  const showErrorTask = hasErrorTrainTask(item.trainTaskList);

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
      <Td fontSize={'sm'}>{item.priceLabel}</Td>
      {showTrainTaskColumn && (
        <Td fontSize={'sm'}>
          {trainTaskCount > 0 ? (
            <HStack spacing={1}>
              <Box
                color={'blue.500'}
                cursor={item.trainableModelType ? 'pointer' : 'default'}
                _hover={item.trainableModelType ? { textDecoration: 'underline' } : undefined}
                onClick={() => {
                  if (!item.trainableModelType) return;
                  setTrainDetailModel({
                    model: item.model,
                    name: item.name,
                    baseModelType: item.trainableModelType
                  });
                }}
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
                  >
                    <MyIcon name={'common/running'} w={'16px'} h={'16px'} />
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
          handleOpenTrainModel={handleOpenTrainModel}
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
  handleOpenTrainModel
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
      onClick={() => handleOpenTrainModel(item.trainableModelType!, item.model)}
    >
      {t('account_model:train')}
    </Button>
  ) : null;

  return (
    <HStack spacing={2}>
      {showTrainButton && (
        <MyTooltip label={t('account_model:base_model_train_tip')}>{trainButton}</MyTooltip>
      )}
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
            <Button size={'sm'} variant={'whiteBase'} onClick={onOpenManageModal}>
              {t('common:permission.Permission')}
            </Button>
          )}
        </LazyCollaboratorProvider>
      )}
    </HStack>
  );
};

export default ModelListTable;
