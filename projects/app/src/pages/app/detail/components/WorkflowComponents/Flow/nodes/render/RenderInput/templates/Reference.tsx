import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, ButtonProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { computedNodeInputReference } from '@/web/core/workflow/utils';
import { useTranslation } from 'next-i18next';
import {
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { ReferenceValueProps } from '@fastgpt/global/core/workflow/type/io';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppContext } from '@/pages/app/detail/components/context';

const MultipleRowSelect = dynamic(
  () => import('@fastgpt/web/components/common/MySelect/MultipleRowSelect')
);
const Avatar = dynamic(() => import('@fastgpt/web/components/common/Avatar'));

type SelectProps = {
  value?: ReferenceValueProps[];
  placeholder?: string;
  list: {
    label: string | React.ReactNode;
    value: string;
    children: {
      label: string;
      value: string;
      valueType?: WorkflowIOValueTypeEnum;
    }[];
  }[];
  onSelect: (val: ReferenceValueProps | ReferenceValueProps[]) => void;
  popDirection?: 'top' | 'bottom';
  styles?: ButtonProps;
  isArray?: boolean;
};

const isReference = (val: any) =>
  Array.isArray(val) &&
  val.length === 2 &&
  typeof val[0] === 'string' &&
  typeof val[1] === 'string';

const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const onSelect = useCallback(
    (e: ReferenceValueProps | ReferenceValueProps[]) => {
      const workflowStartNode = nodeList.find(
        (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
      );
      if (e[0] === workflowStartNode?.id && e[1] !== NodeOutputKeyEnum.userChatInput) {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: [VARIABLE_NODE_ID, e[1]]
          }
        });
      } else {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: e
          }
        });
      }
    },
    [item, nodeId, nodeList, onChangeNode]
  );

  const { referenceList, formatValue } = useReference({
    nodeId,
    valueType: item.valueType,
    value: item.value
  });

  const popDirection = useMemo(() => {
    const node = nodeList.find((node) => node.nodeId === nodeId);
    if (!node) return 'bottom';
    return node.flowNodeType === FlowNodeTypeEnum.loop ? 'top' : 'bottom';
  }, [nodeId, nodeList]);

  return (
    <ReferSelector
      placeholder={t((item.referencePlaceholder as any) || 'select_reference_variable')}
      list={referenceList}
      value={formatValue}
      onSelect={onSelect}
      popDirection={popDirection}
      isArray={item.valueType?.includes('array')}
    />
  );
};

export default React.memo(Reference);

export const useReference = ({
  nodeId,
  valueType = WorkflowIOValueTypeEnum.any,
  value
}: {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  value?: any;
}) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);
  const isArray = valueType?.includes('array');
  const currentType = isArray ? valueType.replace('array', '').toLowerCase() : valueType;

  const referenceList = useMemo(() => {
    const sourceNodes = computedNodeInputReference({
      nodeId,
      nodes: nodeList,
      edges: edges,
      chatConfig: appDetail.chatConfig,
      t
    });

    if (!sourceNodes) return [];

    // 转换为 select 的数据结构
    const list: SelectProps['list'] = sourceNodes
      .map((node) => {
        return {
          label: (
            <Flex alignItems={'center'}>
              <Avatar src={node.avatar} w={isArray ? '1rem' : '1.25rem'} borderRadius={'xs'} />
              <Box ml={1}>{t(node.name as any)}</Box>
            </Flex>
          ),
          value: node.nodeId,
          children: node.outputs
            .filter(
              (output) =>
                valueType === WorkflowIOValueTypeEnum.any ||
                output.valueType === WorkflowIOValueTypeEnum.any ||
                currentType === output.valueType ||
                // array
                output.valueType === valueType ||
                (valueType === WorkflowIOValueTypeEnum.arrayAny &&
                  [
                    WorkflowIOValueTypeEnum.arrayString,
                    WorkflowIOValueTypeEnum.arrayNumber,
                    WorkflowIOValueTypeEnum.arrayBoolean,
                    WorkflowIOValueTypeEnum.arrayObject,
                    WorkflowIOValueTypeEnum.string,
                    WorkflowIOValueTypeEnum.number,
                    WorkflowIOValueTypeEnum.boolean,
                    WorkflowIOValueTypeEnum.object
                  ].includes(output.valueType as WorkflowIOValueTypeEnum))
            )
            .filter((output) => output.id !== NodeOutputKeyEnum.addOutputParam)
            .map((output) => {
              return {
                label: t((output.label as any) || ''),
                value: output.id,
                valueType: output.valueType
              };
            })
        };
      })
      .filter((item) => item.children.length > 0);

    return list;
  }, [appDetail.chatConfig, currentType, edges, isArray, nodeId, nodeList, t, valueType]);

  const formatValue = useMemo(() => {
    // convert origin reference [variableId, outputId] to new reference [[variableId, outputId], ...]
    if (isReference(value)) {
      return [value] as ReferenceValueProps[];
    } else if (Array.isArray(value) && value.every((item) => isReference(item))) {
      return value as ReferenceValueProps[];
    }
    return undefined;
  }, [value]);

  return {
    referenceList,
    formatValue
  };
};

const ReferSelectorComponent = ({
  placeholder,
  value,
  list = [],
  onSelect,
  popDirection,
  isArray
}: SelectProps) => {
  const { t } = useTranslation();
  const selectValue = useMemo(() => {
    if (!value || value.every((item) => !item || item.every((subItem) => !subItem))) {
      return;
    }
    return value.map((valueItem) => {
      const firstColumn = list.find((item) => item.value === valueItem[0]);
      if (!firstColumn) {
        return;
      }
      const secondColumn = firstColumn.children.find((item) => item.value === valueItem[1]);
      if (!secondColumn) {
        return;
      }
      return [firstColumn, secondColumn];
    });
  }, [list, value]);
  console.log('selectValue', value, selectValue, isArray);

  const Render = useMemo(() => {
    return (
      <MultipleRowSelect
        label={
          selectValue && selectValue.length > 0 ? (
            <Flex
              gap={2}
              flexWrap={isArray ? 'wrap' : undefined}
              alignItems={'center'}
              fontSize={'14px'}
            >
              {isArray ? (
                // [[variableId, outputId], ...]
                selectValue.map((item, index) => {
                  const isInvalidItem = item === undefined;
                  return (
                    <Flex
                      alignItems={'center'}
                      key={index}
                      bg={isInvalidItem ? 'red.50' : 'primary.50'}
                      color={isInvalidItem ? 'red.600' : 'myGray.900'}
                      py={1}
                      px={1.5}
                      rounded={'sm'}
                    >
                      {isInvalidItem ? (
                        t('common:invalid_variable')
                      ) : (
                        <>
                          {item?.[0].label}
                          <MyIcon
                            name={'common/rightArrowLight'}
                            mx={1}
                            w={'12px'}
                            color={'myGray.500'}
                          />
                          {item?.[1].label}
                        </>
                      )}
                      <MyIcon
                        name={'common/closeLight'}
                        w={'16px'}
                        ml={1}
                        cursor={'pointer'}
                        color={'myGray.500'}
                        _hover={{
                          color: 'primary.600'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isInvalidItem) {
                            const filteredValue = value?.filter((_, i) => i !== index);
                            onSelect(filteredValue as any);
                            return;
                          }
                          const filteredValue = value?.filter(
                            (val) => val[0] !== item?.[0].value || val[1] !== item?.[1].value
                          );
                          filteredValue && onSelect(filteredValue);
                        }}
                      />
                    </Flex>
                  );
                })
              ) : // [variableId, outputId]
              selectValue[0] ? (
                <Flex py={1} pl={1}>
                  {selectValue[0][0].label}
                  <MyIcon name={'common/rightArrowLight'} mx={1} w={'12px'} color={'myGray.500'} />
                  {selectValue[0][1].label}
                </Flex>
              ) : (
                <Box pl={2} py={1} fontSize={'14px'}>
                  {placeholder}
                </Box>
              )}
            </Flex>
          ) : (
            <Box pl={2} py={1} fontSize={'14px'}>
              {placeholder}
            </Box>
          )
        }
        value={value as any[]}
        list={list}
        onSelect={(e) => {
          onSelect(e as ReferenceValueProps);
        }}
        popDirection={popDirection}
        isArray={isArray}
      />
    );
  }, [isArray, list, onSelect, placeholder, popDirection, selectValue, t, value]);

  return Render;
};

ReferSelectorComponent.displayName = 'ReferSelector';

export const ReferSelector = React.memo(ReferSelectorComponent);
