import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  TableContainer,
  Tbody
} from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import DndDrag, {
  Draggable,
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import VariableEditModal from './VariableEditModal';

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
  const newVariable = { ...defaultVariable, list: [{ value: '', label: '' }] };
  return newVariable;
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
      <Flex alignItems={'center'}>
        <MyIcon name={'core/app/simpleMode/variable'} w={'20px'} />
        <FormLabel ml={2} color={'myGray.600'}>
          {t('common:core.module.Variable')}
        </FormLabel>
        <ChatFunctionTip type={'variable'} />
        <Box flex={1} />
        <Button
          variant={'transparentBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          size={'sm'}
          color={'myGray.600'}
          mr={'-5px'}
          onClick={() => {
            setEditingVariable(addVariable());
          }}
        >
          {t('common:add_new')}
        </Button>
      </Flex>
      {/* Form render */}
      {formatVariables.length > 0 && (
        <TableContainer mt={2} borderRadius={'md'} overflow={'hidden'} borderWidth={'1px'}>
          <Table variant={'workflow'}>
            <Thead>
              <Tr>
                <Th>{t('workflow:Variable_name')}</Th>
                <Th>{t('common:Required_input')}</Th>
                <Th>{t('common:Operation')}</Th>
              </Tr>
            </Thead>
            <DndDrag<VariableItemType>
              onDragEndCb={(list) => {
                onChange(list);
              }}
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
                          key={item.key}
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
  return (
    <Tr
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
    >
      <Td fontWeight={'medium'}>
        <Flex alignItems={'center'}>
          <MyIcon name={item.icon as any} w={'16px'} color={'myGray.400'} mr={1} />
          {item.label}
        </Flex>
      </Td>
      <Td>
        <Flex alignItems={'center'}>
          {item.required ? <MyIcon name={'check'} w={'16px'} color={'myGray.900'} mr={2} /> : ''}
        </Flex>
      </Td>
      <Td>
        <Flex>
          <MyIconButton
            icon={'common/settingLight'}
            onClick={() => {
              const formattedItem = {
                ...item,
                list:
                  item.list ||
                  item.enums?.map((item) => ({ label: item.value, value: item.value })) ||
                  []
              };
              onEdit(formattedItem);
            }}
          />
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
