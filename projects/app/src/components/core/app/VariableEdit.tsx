import React, { useCallback, useMemo } from 'react';
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
  Stack,
  Tbody
} from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  VariableInputEnum,
  variableMap,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useForm, type UseFormReset } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import InputTypeConfig from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import DndDrag, {
  Draggable,
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export const defaultVariable: VariableItemType = {
  id: getNanoid(6),
  key: '',
  label: '',
  type: VariableInputEnum.input,
  description: '',
  required: true,
  valueType: WorkflowIOValueTypeEnum.string
};

type InputItemType = VariableItemType & {
  list: { label: string; value: string }[];
};

export const addVariable = () => {
  const newVariable = { ...defaultVariable, key: '', id: '', list: [{ value: '', label: '' }] };
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
  const { toast } = useToast();

  const form = useForm<VariableItemType>();
  const { setValue, reset, watch, getValues } = form;
  const value = getValues();
  const type = watch('type');

  const inputTypeList = useMemo(
    () =>
      Object.values(variableMap)
        .filter((item) => item.value !== VariableInputEnum.textarea)
        .map((item) => ({
          icon: item.icon,
          label: t(item.label as any),
          value: item.value,
          defaultValueType: item.defaultValueType,
          description: item.description ? t(item.description as any) : ''
        })),
    [t]
  );

  const defaultValueType = useMemo(() => {
    const item = inputTypeList.find((item) => item.value === type);
    return item?.defaultValueType;
  }, [inputTypeList, type]);

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

  const onSubmitSuccess = useCallback(
    (data: InputItemType, action: 'confirm' | 'continue') => {
      data.label = data?.label?.trim();

      const existingVariable = variables.find(
        (item) => item.label === data.label && item.id !== data.id
      );
      if (existingVariable) {
        toast({
          status: 'warning',
          title: t('common:core.module.variable.key already exists')
        });
        return;
      }

      data.key = data.label;
      data.enums = data.list;

      if (data.type === VariableInputEnum.custom) {
        data.required = false;
      } else {
        data.valueType = inputTypeList.find((item) => item.value === data.type)?.defaultValueType;
      }

      const onChangeVariable = [...variables];
      if (data.id) {
        const index = variables.findIndex((item) => item.id === data.id);
        onChangeVariable[index] = data;
      } else {
        onChangeVariable.push({
          ...data,
          id: getNanoid(6)
        });
      }

      if (action === 'confirm') {
        onChange(onChangeVariable);
        reset({});
      } else if (action === 'continue') {
        onChange(onChangeVariable);
        toast({
          status: 'success',
          title: t('common:add_success')
        });
        reset({
          ...addVariable(),
          defaultValue: ''
        });
      }
    },
    [variables, toast, t, inputTypeList, onChange, reset]
  );

  const onSubmitError = useCallback(
    (e: Object) => {
      for (const item of Object.values(e)) {
        if (item.message) {
          toast({
            status: 'warning',
            title: item.message
          });
          break;
        }
      }
    },
    [toast]
  );

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
            reset(addVariable());
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
                  reset={reset}
                  onChange={onChange}
                  variables={variables}
                />
              )}
              zoom={zoom}
            >
              {({ provided }) => (
                <Tbody {...provided.droppableProps} ref={provided.innerRef}>
                  {formatVariables.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <TableItem
                          provided={provided}
                          snapshot={snapshot}
                          item={item}
                          reset={reset}
                          onChange={onChange}
                          variables={variables}
                          key={item.id}
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
      {!!Object.keys(value).length && (
        <MyModal
          iconSrc="core/app/simpleMode/variable"
          title={t('common:core.module.Variable Setting')}
          isOpen={true}
          onClose={() => reset({})}
          maxW={['90vw', '928px']}
          w={'100%'}
          isCentered
        >
          <Flex h={'560px'}>
            <Stack gap={4} p={8}>
              <FormLabel color={'myGray.600'} fontWeight={'medium'}>
                {t('workflow:Variable.Variable type')}
              </FormLabel>
              <Flex flexDirection={'column'} gap={4}></Flex>
              <Box display={'grid'} gridTemplateColumns={'repeat(2, 1fr)'} gap={4}>
                {inputTypeList.map((item) => {
                  const isSelected = type === item.value;
                  return (
                    <Box
                      display={'flex'}
                      key={item.label}
                      border={isSelected ? '1px solid #3370FF' : '1px solid #DFE2EA'}
                      p={3}
                      rounded={'6px'}
                      fontWeight={'medium'}
                      fontSize={'14px'}
                      alignItems={'center'}
                      cursor={'pointer'}
                      boxShadow={isSelected ? '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' : 'none'}
                      _hover={{
                        '& > svg': {
                          color: 'primary.600'
                        },
                        '& > span': {
                          color: 'myGray.900'
                        },
                        border: '1px solid #3370FF',
                        boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
                      }}
                      onClick={() => {
                        const defaultValIsNumber = !isNaN(Number(value.defaultValue));
                        // 如果切换到 numberInput，不是数字，则清空
                        if (
                          item.value === VariableInputEnum.select ||
                          (item.value === VariableInputEnum.numberInput && !defaultValIsNumber)
                        ) {
                          setValue('defaultValue', '');
                        }
                        setValue('type', item.value);
                      }}
                    >
                      <MyIcon
                        name={item.icon as any}
                        w={'20px'}
                        mr={1.5}
                        color={isSelected ? 'primary.600' : 'myGray.400'}
                      />
                      <Box
                        as="span"
                        color={isSelected ? 'myGray.900' : 'inherit'}
                        pr={4}
                        whiteSpace="nowrap"
                      >
                        {item.label}
                      </Box>
                      {item.description && (
                        <QuestionTip label={item.description as string} ml={1} />
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Stack>
            <InputTypeConfig
              form={form}
              type={'variable'}
              isEdit={!!value.key}
              inputType={type}
              defaultValueType={defaultValueType}
              onClose={() => reset({})}
              onSubmitSuccess={onSubmitSuccess}
              onSubmitError={onSubmitError}
            />
          </Flex>
        </MyModal>
      )}
    </Box>
  );
};

const TableItem = ({
  provided,
  snapshot,
  item,
  reset,
  onChange,
  variables
}: {
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  item: VariableItemType & {
    icon?: string;
  };
  reset: UseFormReset<VariableItemType>;
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
          {item.key}
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
                list: item.enums || []
              };
              reset(formattedItem);
            }}
          />
          <MyIconButton
            icon={'delete'}
            hoverColor={'red.500'}
            onClick={() => onChange(variables.filter((variable) => variable.id !== item.id))}
          />
        </Flex>
      </Td>
    </Tr>
  );
};

export default React.memo(VariableEdit);
