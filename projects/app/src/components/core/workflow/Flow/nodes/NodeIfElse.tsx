import React, { useCallback, useMemo } from 'react';
import NodeCard from './render/NodeCard';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, background } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import RenderOutput from './render/RenderOutput';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeProps } from 'reactflow';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type';
import {
  IfElseConditionType,
  IfElseListItemType
} from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { ReferenceValueProps } from '@fastgpt/global/core/workflow/type/io';
import { ReferSelector, useReference } from './render/RenderInput/templates/Reference';
import {
  VariableConditionEnum,
  allConditionList,
  arrayConditionList,
  booleanConditionList,
  numberConditionList
} from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { stringConditionList } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyInput from '@/components/MyInput';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const NodeIfElse = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs = [], outputs } = data;
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const condition = useMemo(
    () =>
      (inputs.find((input) => input.key === NodeInputKeyEnum.condition)
        ?.value as IfElseConditionType) || 'OR',
    [inputs]
  );
  const ifElseList = useMemo(
    () =>
      (inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList)
        ?.value as IfElseListItemType[]) || [],
    [inputs]
  );

  const onUpdateIfElseList = useCallback(
    (value: IfElseListItemType[]) => {
      const ifElseListInput = inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList);
      if (!ifElseListInput) return;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.ifElseList,
        value: {
          ...ifElseListInput,
          value
        }
      });
    },
    [inputs, nodeId, onChangeNode]
  );

  const RenderAddCondition = useMemo(() => {
    return (
      <Button
        onClick={() => {
          onUpdateIfElseList([
            ...ifElseList,
            {
              variable: undefined,
              condition: undefined,
              value: undefined
            }
          ]);
        }}
        variant={'whiteBase'}
        leftIcon={<SmallAddIcon />}
        my={3}
        w={'full'}
      >
        {t('core.module.input.add')}
      </Button>
    );
  }, [ifElseList, onUpdateIfElseList, t]);

  return (
    <NodeCard selected={selected} maxW={'1000px'} {...data}>
      <Box px={6}>
        <RenderOutput nodeId={nodeId} flowOutputList={[outputs[0]]} />
      </Box>
      <Box py={3} px={4}>
        <Box className="nowheel">
          {ifElseList.map((item, i) => {
            return (
              <Box key={i}>
                {/* border */}
                {i !== 0 && (
                  <Flex alignItems={'center'} w={'full'} py={'5px'}>
                    <Box
                      w={'auto'}
                      flex={1}
                      height={'1px'}
                      style={{
                        background:
                          'linear-gradient(90deg, rgba(232, 235, 240, 0.00) 0%, #E8EBF0 100%)'
                      }}
                    ></Box>
                    <Flex
                      px={'2.5'}
                      color={'primary.600'}
                      fontWeight={'medium'}
                      alignItems={'center'}
                      cursor={'pointer'}
                      rounded={'md'}
                      onClick={() => {
                        const conditionInput = inputs.find(
                          (input) => input.key === NodeInputKeyEnum.condition
                        );
                        if (!conditionInput) return;

                        onChangeNode({
                          nodeId,
                          type: 'updateInput',
                          key: NodeInputKeyEnum.condition,
                          value: {
                            ...conditionInput,
                            value: conditionInput.value === 'OR' ? 'AND' : 'OR'
                          }
                        });
                      }}
                    >
                      {condition}
                      <MyIcon ml={1} boxSize={5} name="change" />
                    </Flex>
                    <Box
                      w={'auto'}
                      flex={1}
                      height={'1px'}
                      style={{
                        background:
                          'linear-gradient(90deg, #E8EBF0 0%, rgba(232, 235, 240, 0.00) 100%)'
                      }}
                    ></Box>
                  </Flex>
                )}
                {/* condition list */}
                <Flex gap={2} alignItems={'center'}>
                  {/* variable reference */}
                  <Box minW={'250px'}>
                    <Reference
                      nodeId={nodeId}
                      variable={item.variable}
                      onSelect={(e) => {
                        onUpdateIfElseList(
                          ifElseList.map((ifElse, index) => {
                            if (index === i) {
                              return {
                                ...ifElse,
                                variable: e
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
                            if (index === i) {
                              return {
                                ...ifElse,
                                condition: e
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
                            if (index === i) {
                              return {
                                ...ifElse,
                                value: e
                              };
                            }
                            return ifElse;
                          })
                        );
                      }}
                    />
                  </Box>
                  {/* delete */}
                  {ifElseList.length > 1 && (
                    <MyIcon
                      ml={2}
                      boxSize={5}
                      name="delete"
                      cursor={'pointer'}
                      _hover={{ color: 'red.600' }}
                      color={'myGray.400'}
                      onClick={() => {
                        onUpdateIfElseList(ifElseList.filter((_, index) => index !== i));
                      }}
                    />
                  )}
                </Flex>
              </Box>
            );
          })}
        </Box>
        {RenderAddCondition}
      </Box>
      <Box px={6} mb={4}>
        <RenderOutput nodeId={nodeId} flowOutputList={[outputs[1]]} />
      </Box>
    </NodeCard>
  );
};
export default React.memo(NodeIfElse);

const Reference = ({
  nodeId,
  variable,
  onSelect
}: {
  nodeId: string;
  variable?: ReferenceValueProps;
  onSelect: (e: ReferenceValueProps) => void;
}) => {
  const { t } = useTranslation();

  const { referenceList, formatValue } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any,
    value: variable
  });

  return (
    <ReferSelector
      placeholder={t('选择引用变量')}
      list={referenceList}
      value={formatValue}
      onSelect={onSelect}
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
  variable?: ReferenceValueProps;
  onSelect: (e: VariableConditionEnum) => void;
}) => {
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  // get condition type
  const valueType = useMemo(() => {
    if (!variable) return;
    const node = nodeList.find((node) => node.nodeId === variable[0]);

    if (!node) return WorkflowIOValueTypeEnum.any;
    const output = node.outputs.find((item) => item.id === variable[1]);

    if (!output) return WorkflowIOValueTypeEnum.any;
    return output.valueType;
  }, [nodeList, variable]);

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
      valueType === WorkflowIOValueTypeEnum.arrayString ||
      valueType === WorkflowIOValueTypeEnum.object
    )
      return arrayConditionList;

    if (valueType === WorkflowIOValueTypeEnum.any) return allConditionList;

    return [];
  }, [valueType]);

  return (
    <MySelect
      w={'100%'}
      list={conditionList}
      value={condition}
      onchange={onSelect}
      placeholder="选择条件"
    ></MySelect>
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
  variable?: ReferenceValueProps;
  condition?: VariableConditionEnum;
  onChange: (e: string) => void;
}) => {
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

  if (valueType === WorkflowIOValueTypeEnum.boolean) {
    return (
      <MySelect
        list={[
          { label: 'True', value: 'true' },
          { label: 'False', value: 'false' }
        ]}
        onchange={onChange}
        value={value}
        placeholder={'选择值'}
      />
    );
  } else {
    return (
      <MyInput
        value={value}
        placeholder={'输入值'}
        w={'100%'}
        isDisabled={
          condition === VariableConditionEnum.isEmpty ||
          condition === VariableConditionEnum.isNotEmpty
        }
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
};
