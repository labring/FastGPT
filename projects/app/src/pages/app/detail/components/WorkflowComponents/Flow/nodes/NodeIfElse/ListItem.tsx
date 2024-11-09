import { Box, Button, Flex } from '@chakra-ui/react';
import {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag/index';
import Container from '../../components/Container';
import { MinusIcon, SmallAddIcon } from '@chakra-ui/icons';
import { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ReferenceItemValueType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import { ReferSelector, useReference } from '../render/RenderInput/templates/Reference';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  VariableConditionEnum,
  allConditionList,
  arrayConditionList,
  booleanConditionList,
  numberConditionList,
  objectConditionList,
  stringConditionList
} from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { useContextSelector } from 'use-context-selector';
import React, { useMemo } from 'react';
import { WorkflowContext } from '../../../context';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyInput from '@/components/MyInput';
import { getElseIFLabel, getHandleId } from '@fastgpt/global/core/workflow/utils';
import { SourceHandle } from '../render/Handle';
import { Position, useReactFlow } from 'reactflow';
import { getRefData } from '@/web/core/workflow/utils';
import DragIcon from '@fastgpt/web/components/common/DndDrag/DragIcon';
import { AppContext } from '@/pages/app/detail/components/context';
import { useI18n } from '@/web/context/I18n';

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
        alignItems={'center'}
        position={'relative'}
        transform={snapshot.isDragging ? `scale(${getZoom()})` : ''}
        transformOrigin={'top left'}
        mb={2}
      >
        <Container w={snapshot.isDragging ? '' : 'full'} className="nodrag">
          <Flex mb={4} alignItems={'center'}>
            {ifElseList.length > 1 && <DragIcon provided={provided} />}
            <Box color={'black'} fontSize={'md'} ml={2}>
              {getElseIFLabel(conditionIndex)}
            </Box>
            {conditionItem.list?.length > 1 && (
              <Flex
                px={'2.5'}
                color={'primary.600'}
                fontWeight={'medium'}
                alignItems={'center'}
                cursor={'pointer'}
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
            <Box flex={1}></Box>
            {ifElseList.length > 1 && (
              <MyIcon
                ml={2}
                boxSize={5}
                name="delete"
                cursor={'pointer'}
                _hover={{ color: 'red.600' }}
                color={'myGray.400'}
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
                  <Flex gap={2} mb={2} alignItems={'center'}>
                    {/* variable reference */}
                    <Box minW={'250px'}>
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
                    </Box>
                    {/* condition select */}
                    <Box w={'130px'} flex={1}>
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
                    </Box>
                    {/* value */}
                    <Box w={'200px'}>
                      <ConditionValueInput
                        value={item.value}
                        condition={item.condition}
                        variable={item.variable}
                        onChange={(e) => {
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
                                            value: e
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
                    </Box>
                    {/* delete */}
                    {conditionItem.list.length > 1 && (
                      <MinusIcon
                        ml={2}
                        boxSize={3}
                        name="delete"
                        cursor={'pointer'}
                        _hover={{ color: 'red.600' }}
                        color={'myGray.400'}
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
            leftIcon={<SmallAddIcon />}
            color={'primary.600'}
          >
            {t('common:core.module.input.add')}
          </Button>
        </Container>
        {!snapshot.isDragging && (
          <SourceHandle
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
      w={'100%'}
      list={filterQuiredConditionList}
      value={condition}
      onchange={onSelect}
      placeholder={t('common:chose_condition')}
    />
  );
};

/* 
  Different condition can be entered differently
  empty, notEmpty: forbid input
  boolean type: select true/false
*/
const ConditionValueInput = ({
  value = '',
  variable,
  condition,
  onChange
}: {
  value?: string;
  variable?: ReferenceItemValueType;
  condition?: VariableConditionEnum;
  onChange: (e: string) => void;
}) => {
  const { workflowT } = useI18n();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  // get value type
  const valueType = useMemo(() => {
    if (!variable) return;
    const node = nodeList.find((node) => node.nodeId === variable[0]);

    if (!node) return WorkflowIOValueTypeEnum.any;
    const output = node.outputs.find((item) => item.id === variable[1]);

    if (!output) return WorkflowIOValueTypeEnum.any;
    return output.valueType;
  }, [nodeList, variable]);

  const Render = useMemo(() => {
    if (valueType === WorkflowIOValueTypeEnum.boolean) {
      return (
        <MySelect
          list={[
            { label: 'True', value: 'true' },
            { label: 'False', value: 'false' }
          ]}
          onchange={onChange}
          value={value}
          placeholder={workflowT('ifelse.Select value')}
          isDisabled={
            condition === VariableConditionEnum.isEmpty ||
            condition === VariableConditionEnum.isNotEmpty
          }
        />
      );
    } else {
      return (
        <MyInput
          value={value}
          placeholder={
            condition === VariableConditionEnum.reg
              ? '/^((+|00)86)?1[3-9]d{9}$/'
              : workflowT('ifelse.Input value')
          }
          w={'100%'}
          bg={'white'}
          isDisabled={
            condition === VariableConditionEnum.isEmpty ||
            condition === VariableConditionEnum.isNotEmpty
          }
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
  }, [condition, onChange, value, valueType, workflowT]);

  return Render;
};
