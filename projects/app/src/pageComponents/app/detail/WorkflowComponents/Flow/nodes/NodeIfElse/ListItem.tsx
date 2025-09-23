import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import {
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag/index';
import Container from '../../components/Container';
import { MinusIcon } from '@chakra-ui/icons';
import { type IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { type ReferenceItemValueType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import { ReferSelector, useReference } from '../render/RenderInput/templates/Reference';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  VariableConditionEnum,
  allConditionList,
  arrayConditionList,
  booleanConditionList,
  numberConditionList,
  objectConditionList,
  renderNumberConditionList,
  stringConditionList
} from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { useContextSelector } from 'use-context-selector';
import React, { useMemo } from 'react';
import { WorkflowContext } from '../../../context';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyInput from '@/components/MyInput';
import { getElseIFLabel, getHandleId } from '@fastgpt/global/core/workflow/utils';
import { MySourceHandle } from '../render/Handle';
import { Position, useReactFlow } from 'reactflow';
import { getRefData, getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import DragIcon from '@fastgpt/web/components/common/DndDrag/DragIcon';
import { AppContext } from '@/pageComponents/app/detail/context';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const ListItem = ({
  provided,
  snapshot,
  conditionIndex,
  conditionItem,
  ifElseList,
  onUpdateIfElseList,
  nodeId
}: {
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  conditionIndex: number;
  conditionItem: IfElseListItemType;
  ifElseList: IfElseListItemType[];
  onUpdateIfElseList: (value: IfElseListItemType[]) => void;
  nodeId: string;
}) => {
  const { t } = useTranslation();
  const { getZoom } = useReactFlow();
  const onDelEdge = useContextSelector(WorkflowContext, (v) => v.onDelEdge);
  const handleId = getHandleId(nodeId, 'source', getElseIFLabel(conditionIndex));

  const Render = useMemo(() => {
    return (
      <Flex
        position={'relative'}
        transform={snapshot.isDragging ? `scale(${getZoom()})` : ''}
        transformOrigin={'top left'}
        mb={2}
      >
        <Container w={snapshot.isDragging ? '' : 'full'} className="nodrag">
          <Flex mb={4} alignItems={'center'}>
            {ifElseList.length > 1 && <DragIcon provided={provided} />}
            <Box color={'myGray.900'} fontWeight={'medium'} fontSize={'md'} ml={2}>
              {getElseIFLabel(conditionIndex)}
            </Box>
            {conditionItem.list?.length > 1 && (
              <Flex
                ml={1.5}
                px={1}
                color={'primary.600'}
                fontWeight={'medium'}
                alignItems={'center'}
                cursor={'pointer'}
                _hover={{
                  bg: 'myGray.200'
                }}
                rounded={'md'}
                onClick={() => {
                  onUpdateIfElseList(
                    ifElseList.map((ifElse, index) => {
                      if (index === conditionIndex) {
                        return {
                          ...ifElse,
                          condition: ifElse.condition === 'AND' ? 'OR' : 'AND'
                        };
                      }
                      return ifElse;
                    })
                  );
                }}
              >
                {conditionItem.condition}
                <MyIcon ml={1} boxSize={5} name="change" />
              </Flex>
            )}
            <Box flex={1} />
            {ifElseList.length > 1 && (
              <MyIcon
                ml={2}
                boxSize={5}
                name="delete"
                cursor={'pointer'}
                _hover={{ color: 'red.600' }}
                color={'myGray.600'}
                onClick={() => {
                  onUpdateIfElseList(ifElseList.filter((_, index) => index !== conditionIndex));
                  onDelEdge({
                    nodeId,
                    sourceHandle: handleId
                  });
                }}
              />
            )}
          </Flex>
          <Box>
            {conditionItem.list?.map((item, i) => {
              return (
                <Box key={i}>
                  {/* condition list */}
                  <Flex gap={1.5} mb={2} alignItems={'center'}>
                    {/* variable reference */}
                    <VariableSelector
                      nodeId={nodeId}
                      variable={item.variable}
                      onSelect={(e) => {
                        onUpdateIfElseList(
                          ifElseList.map((ifElse, index) => {
                            if (index === conditionIndex) {
                              return {
                                ...ifElse,
                                list: ifElse.list.map((item, index) => {
                                  if (index === i) {
                                    return {
                                      ...item,
                                      variable: e,
                                      condition: undefined
                                    };
                                  }
                                  return item;
                                })
                              };
                            }
                            return ifElse;
                          })
                        );
                      }}
                    />
                    {/* condition select */}
                    <ConditionSelect
                      condition={item.condition}
                      variable={item.variable}
                      onSelect={(e) => {
                        onUpdateIfElseList(
                          ifElseList.map((ifElse, index) => {
                            if (index === conditionIndex) {
                              return {
                                ...ifElse,
                                list: ifElse.list.map((item, index) => {
                                  if (index === i) {
                                    return {
                                      ...item,
                                      condition: e
                                    };
                                  }
                                  return item;
                                })
                              };
                            }
                            return ifElse;
                          })
                        );
                      }}
                    />
                    {/* value */}
                    <ConditionValueInput
                      value={item.value}
                      valueType={item.valueType}
                      condition={item.condition}
                      variable={item.variable}
                      nodeId={nodeId}
                      updateValue={(value, valueType) => {
                        onUpdateIfElseList(
                          ifElseList.map((ifElse, index) => {
                            return {
                              ...ifElse,
                              list:
                                index === conditionIndex
                                  ? ifElse.list.map((item, index) => {
                                      if (index === i) {
                                        return {
                                          ...item,
                                          value,
                                          valueType
                                        };
                                      }
                                      return item;
                                    })
                                  : ifElse.list
                            };
                          })
                        );
                      }}
                    />
                    {/* delete */}
                    {conditionItem.list.length > 1 && (
                      <MyIconButton
                        icon="minus"
                        hoverColor={'red.600'}
                        hoverBg="red.100"
                        onClick={() => {
                          onUpdateIfElseList(
                            ifElseList.map((ifElse, index) => {
                              if (index === conditionIndex) {
                                return {
                                  ...ifElse,
                                  list: ifElse.list.filter((_, index) => index !== i)
                                };
                              }
                              return ifElse;
                            })
                          );
                        }}
                      />
                    )}
                  </Flex>
                </Box>
              );
            })}
          </Box>
          <Flex>
            <Button
              onClick={() => {
                onUpdateIfElseList(
                  ifElseList.map((ifElse, index) => {
                    if (index === conditionIndex) {
                      return {
                        ...ifElse,
                        list: ifElse.list.concat({
                          variable: undefined,
                          condition: undefined,
                          value: undefined
                        })
                      };
                    }
                    return ifElse;
                  })
                );
              }}
              variant={'link'}
              leftIcon={<MyIcon name={'common/addLight'} boxSize={4} mr={-1} />}
              color={'primary.700'}
            >
              {t('common:core.module.input.add')}
            </Button>
          </Flex>
        </Container>
        {!snapshot.isDragging && (
          <MySourceHandle
            nodeId={nodeId}
            handleId={handleId}
            position={Position.Right}
            translate={[5, 0]}
          />
        )}
      </Flex>
    );
  }, [
    conditionIndex,
    conditionItem.condition,
    conditionItem.list,
    getZoom,
    handleId,
    ifElseList,
    nodeId,
    onDelEdge,
    onUpdateIfElseList,
    provided,
    snapshot.isDragging,
    t
  ]);

  return (
    <Box
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
    >
      {Render}
    </Box>
  );
};

export default React.memo(ListItem);

const VariableSelector = ({
  nodeId,
  variable,
  onSelect
}: {
  nodeId: string;
  variable?: ReferenceItemValueType;
  onSelect: (e?: ReferenceItemValueType) => void;
}) => {
  const { t } = useTranslation();

  const { referenceList } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any
  });

  return (
    <ReferSelector
      placeholder={t('common:select_reference_variable')}
      list={referenceList}
      value={variable}
      onSelect={onSelect}
      isArray={false}
      ButtonProps={{
        w: '14rem',
        borderColor: 'myGray.200',
        borderRadius: 'sm'
      }}
    />
  );
};

/* Different data types have different options */
const ConditionSelect = ({
  condition,
  variable,
  onSelect
}: {
  condition?: VariableConditionEnum;
  variable?: ReferenceItemValueType;
  onSelect: (e: VariableConditionEnum) => void;
}) => {
  const { t } = useTranslation();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  // get condition type
  const { valueType, required } = useMemo(() => {
    return getRefData({
      variable,
      nodeList,
      chatConfig: appDetail.chatConfig
    });
  }, [appDetail.chatConfig, nodeList, variable]);

  const conditionList = useMemo(() => {
    if (valueType === WorkflowIOValueTypeEnum.string) return stringConditionList;
    if (valueType === WorkflowIOValueTypeEnum.number) return numberConditionList;
    if (valueType === WorkflowIOValueTypeEnum.boolean) return booleanConditionList;
    if (
      valueType === WorkflowIOValueTypeEnum.chatHistory ||
      valueType === WorkflowIOValueTypeEnum.datasetQuote ||
      valueType === WorkflowIOValueTypeEnum.dynamic ||
      valueType === WorkflowIOValueTypeEnum.selectApp ||
      valueType === WorkflowIOValueTypeEnum.arrayBoolean ||
      valueType === WorkflowIOValueTypeEnum.arrayNumber ||
      valueType === WorkflowIOValueTypeEnum.arrayObject ||
      valueType === WorkflowIOValueTypeEnum.arrayString
    )
      return arrayConditionList;
    if (valueType === WorkflowIOValueTypeEnum.object) return objectConditionList;

    if (valueType === WorkflowIOValueTypeEnum.any) return allConditionList;

    return [];
  }, [valueType]);
  const filterQuiredConditionList = useMemo(() => {
    const list = (() => {
      if (required) {
        return conditionList.filter(
          (item) =>
            item.value !== VariableConditionEnum.isEmpty &&
            item.value !== VariableConditionEnum.isNotEmpty
        );
      }
      return conditionList;
    })();
    return list.map((item) => ({
      ...item,
      label: t(item.label)
    }));
  }, [conditionList, required, t]);

  return (
    <MySelect
      className="nowheel"
      w={'135px'}
      h={10}
      borderColor={'myGray.200'}
      list={filterQuiredConditionList}
      value={condition}
      onChange={onSelect}
      placeholder={t('common:chose_condition')}
    />
  );
};

const ConditionValueInput = ({
  value,
  valueType: type,
  variable,
  condition,
  updateValue,
  nodeId
}: {
  value?: string | ReferenceItemValueType;
  valueType?: 'input' | 'reference';
  variable?: ReferenceItemValueType;
  condition?: VariableConditionEnum;
  updateValue: (value: string | ReferenceItemValueType, valueType: 'input' | 'reference') => void;
  nodeId: string;
}) => {
  const { t } = useTranslation();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const isReference = useMemo(() => type === 'reference', [type]);

  const globalVariables = getWorkflowGlobalVariables({
    nodes: nodeList,
    chatConfig: appDetail.chatConfig
  });

  // get value type
  const valueType = useMemo(() => {
    if (variable?.[0] === VARIABLE_NODE_ID) {
      return globalVariables.find((item) => item.key === variable[1])?.valueType;
    } else {
      const node = nodeList.find((node) => node.nodeId === variable?.[0]);
      const output = node?.outputs.find((item) => item.id === variable?.[1]);
      return output?.valueType;
    }
  }, [globalVariables, nodeList, variable]);
  const { referenceList } = useReference({
    nodeId,
    valueType
  });

  const showBooleanSelect = useMemo(() => {
    return (
      valueType === WorkflowIOValueTypeEnum.boolean ||
      (valueType === WorkflowIOValueTypeEnum.arrayBoolean &&
        condition &&
        !renderNumberConditionList.has(condition))
    );
  }, [condition, valueType]);
  const showNumberInput = useMemo(() => {
    return (
      valueType === WorkflowIOValueTypeEnum.number ||
      valueType === WorkflowIOValueTypeEnum.arrayNumber ||
      (valueType?.includes('array') && condition && renderNumberConditionList.has(condition))
    );
  }, [condition, valueType]);

  const RenderInput = useMemo(() => {
    if (showBooleanSelect) {
      return (
        <MySelect
          list={[
            { label: 'True', value: 'true' },
            { label: 'False', value: 'false' }
          ]}
          onChange={(e) => updateValue(e, 'input')}
          value={value as string}
          placeholder={t('workflow:ifelse.Select value')}
          borderLeftRadius={0}
          h={10}
          borderColor={'myGray.200'}
        />
      );
    } else if (showNumberInput) {
      return (
        <MyNumberInput
          step={1}
          inputFieldProps={{
            bg: 'white',
            borderLeftRadius: 'none'
          }}
          value={Number(value as string)}
          onChange={(e) => updateValue(String(e), 'input')}
        />
      );
    } else {
      return (
        <MyInput
          value={value as string}
          placeholder={
            condition === VariableConditionEnum.reg
              ? '/^((+|00)86)?1[3-9]d{9}$/'
              : t('workflow:ifelse.Input value')
          }
          w={'full'}
          h={'full'}
          bg={'white'}
          borderLeftRadius={0}
          onChange={(e) => updateValue(e.target.value, 'input')}
        />
      );
    }
  }, [showBooleanSelect, showNumberInput, value, t, condition, updateValue]);

  const RenderReference = useMemo(() => {
    return (
      <ReferSelector
        placeholder={t('common:select_reference_variable')}
        list={referenceList}
        value={isReference ? (value as ReferenceItemValueType) : undefined}
        onSelect={(e) => {
          updateValue(e as ReferenceItemValueType, 'reference');
        }}
        isArray={false}
        ButtonProps={{
          borderRadius: 'sm',
          borderLeftRadius: 'none',
          borderColor: 'myGray.200',
          w: '100%'
        }}
      />
    );
  }, [t, referenceList, isReference, value, updateValue]);

  const isDisabled =
    condition === VariableConditionEnum.isEmpty || condition === VariableConditionEnum.isNotEmpty;

  return (
    <Flex position="relative">
      <Flex>
        <MyTooltip
          label={
            isReference
              ? t('workflow:click_to_change_reference')
              : t('workflow:click_to_change_value')
          }
        >
          <HStack
            w={'4rem'}
            h={10}
            border={'1px solid'}
            borderRight={'none'}
            borderColor={'myGray.200'}
            borderLeftRadius={'sm'}
            justifyContent={'center'}
            bg={'white'}
            px={2}
            spacing={2}
            cursor={'pointer'}
            _hover={{
              bg: 'myGray.50'
            }}
            onClick={() => {
              if (isDisabled) return;

              if (isReference) {
                updateValue('', 'input');
              } else {
                updateValue(['', undefined], 'reference');
              }
            }}
          >
            {isReference ? (
              <MyIcon name={'core/workflow/inputType/reference'} w={4} color={'primary.600'} />
            ) : (
              <MyIcon name={'core/app/variable/input'} w={4} color={'primary.600'} />
            )}
            <MyIcon name={'common/lineChange'} w={'14px'} color={'myGray.500'} />
          </HStack>
        </MyTooltip>
        <Box w={'14rem'}>{isReference ? RenderReference : RenderInput}</Box>
      </Flex>

      {isDisabled && (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="whiteAlpha.700"
          zIndex={1}
          borderRadius="sm"
          cursor="not-allowed"
        />
      )}
    </Flex>
  );
};
