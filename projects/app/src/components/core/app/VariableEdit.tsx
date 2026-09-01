import React, { useMemo, useState } from 'react';
import { Box, Flex, Table, Thead, Tr, Th, Td, TableContainer, Tbody } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import ChatFunctionTip from './Tip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import DndDrag, {
  Draggable,
  getDraggableItemProps,
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import VariableEditModal from './VariableEditModal';
import AppConfigItem, { AppConfigItemAction } from './AppConfigItem';

export const defaultVariable: VariableItemType = {
  key: '',
  label: '',
  type: VariableInputEnum.input,
  description: '',
  required: true,
  valueType: WorkflowIOValueTypeEnum.string,

  // file select
  canSelectFile: true,
  canSelectImg: true,
  canSelectVideo: false,
  canSelectAudio: false,
  canSelectCustomFileExtension: false,
  customFileExtensionList: [],
  canLocalUpload: true,
  canUrlUpload: false,
  maxFiles: 5,

  // time
  timeGranularity: 'day',
  timeRangeStart: undefined,
  timeRangeEnd: undefined,

  // dataset select
  datasetOptions: []
};

export const addVariable = () => {
  return { ...defaultVariable };
};

const VariableEdit = ({
  variables = [],
  onChange,
  zoom = 1
}: {
  variables?: VariableItemType[];
  onChange: (data: VariableItemType[]) => void;
  zoom?: number;
}) => {
  const { t } = useTranslation();
  const [editingVariable, setEditingVariable] = useState<VariableItemType | null>(null);

  const formatVariables = useMemo(() => {
    const results = formatEditorVariablePickerIcon(variables);
    return results.map<VariableItemType & { icon?: string }>((item) => {
      const variable = variables.find((variable) => variable.key === item.key)!;
      return {
        ...variable,
        icon: item.icon
      };
    });
  }, [variables]);

  return (
    <Box className="nodrag">
      {/* Row box */}
      <AppConfigItem
        icon={'core/app/simpleMode/variable'}
        label={t('common:core.module.Variable')}
        tip={<ChatFunctionTip type={'variable'} />}
        action={
          <AppConfigItemAction
            tooltip={t('common:add_new')}
            leftIcon={<SmallAddIcon />}
            onClick={() => {
              setEditingVariable(addVariable());
            }}
          >
            {t('common:add_new')}
          </AppConfigItemAction>
        }
      />
      {/* Form render */}
      {formatVariables.length > 0 && (
        <TableContainer mt={2} borderRadius={'md'} overflow={'hidden'} borderWidth={'1px'}>
          <Table variant={'workflow'} w={'100%'} sx={{ tableLayout: 'fixed' }}>
            <Thead>
              <Tr>
                <Th pl={'24px !important'} pr={'8px !important'}>
                  {t('workflow:Variable_name')}
                </Th>
                <Th w={'2.5rem'} whiteSpace={'nowrap'} px={'8px !important'}>
                  {t('common:Required_input')}
                </Th>
                <Th w={'4.9rem'} whiteSpace={'nowrap'} pl={'8px !important'} pr={'24px !important'}>
                  {t('common:Operation')}
                </Th>
              </Tr>
            </Thead>
            <DndDrag<VariableItemType>
              onDragEndCb={onChange}
              dataList={formatVariables}
              renderClone={(provided, snapshot, rubric) => (
                <TableItem
                  provided={provided}
                  snapshot={snapshot}
                  item={formatVariables[rubric.source.index]}
                  onEdit={setEditingVariable}
                  onChange={onChange}
                  variables={variables}
                />
              )}
              zoom={zoom}
            >
              {({ provided }) => (
                <Tbody {...provided.droppableProps} ref={provided.innerRef}>
                  {formatVariables.map((item, index) => (
                    <Draggable key={item.key} draggableId={item.key} index={index}>
                      {(provided, snapshot) => (
                        <TableItem
                          provided={provided}
                          snapshot={snapshot}
                          item={item}
                          onEdit={setEditingVariable}
                          onChange={onChange}
                          variables={variables}
                        />
                      )}
                    </Draggable>
                  ))}
                </Tbody>
              )}
            </DndDrag>
          </Table>
        </TableContainer>
      )}

      {/* Edit modal */}
      {editingVariable && (
        <VariableEditModal
          onClose={() => setEditingVariable(null)}
          variable={editingVariable}
          variables={variables}
          onChange={onChange}
        />
      )}
    </Box>
  );
};

const TableItem = ({
  provided,
  snapshot,
  item,
  onEdit,
  onChange,
  variables
}: {
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  item: VariableItemType & {
    icon?: string;
  };
  onEdit: (variable: VariableItemType) => void;
  onChange: (data: VariableItemType[]) => void;
  variables: VariableItemType[];
}) => {
  const handleEdit = () => {
    const formattedItem = {
      ...item,
      list:
        item.list ||
        item.enums?.map((item: { value: string }) => ({ label: item.value, value: item.value })) ||
        []
    };
    onEdit(formattedItem);
  };
  const { draggableItemProps, dragHandleProps } = getDraggableItemProps(provided, snapshot);

  return (
    <Tr {...draggableItemProps} {...dragHandleProps}>
      <Td fontWeight={'medium'} pl={'24px !important'} pr={'8px !important'}>
        <Flex alignItems={'center'}>
          <MyIcon name={item.icon as any} w={'16px'} color={'myGray.400'} mr={1} flexShrink={0} />
          <Box flex={1} minW={0}>
            <MyTooltip label={item.label} showOnlyWhenOverflow>
              <Box className={'textEllipsis'}>{item.label}</Box>
            </MyTooltip>
          </Box>
        </Flex>
      </Td>
      <Td px={'8px !important'}>
        <Flex alignItems={'center'}>
          {item.required ? <MyIcon name={'check'} w={'16px'} color={'myGray.900'} mr={2} /> : ''}
        </Flex>
      </Td>
      <Td pl={'8px !important'} pr={'24px !important'}>
        <Flex>
          <MyIconButton icon={'common/settingLight'} onClick={handleEdit} />
          <MyIconButton
            icon={'delete'}
            hoverColor={'red.500'}
            onClick={() => onChange(variables.filter((variable) => variable.key !== item.key))}
          />
        </Flex>
      </Td>
    </Tr>
  );
};

export default React.memo(VariableEdit);
