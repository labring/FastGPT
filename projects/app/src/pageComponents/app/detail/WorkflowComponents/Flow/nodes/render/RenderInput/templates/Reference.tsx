import React, { useCallback, useEffect, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, type ButtonProps, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  computedNodeInputReference,
  filterWorkflowNodeOutputsByType
} from '@/web/core/workflow/utils';
import { useTranslation } from 'next-i18next';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type {
  ReferenceArrayValueType,
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowNodeEdgeContext } from '../../../../../context/workflowInitContext';

const MultipleRowSelect = dynamic(() =>
  import('@fastgpt/web/components/common/MySelect/MultipleRowSelect').then(
    (v) => v.MultipleRowSelect
  )
);
const MultipleRowArraySelect = dynamic(() =>
  import('@fastgpt/web/components/common/MySelect/MultipleRowSelect').then(
    (v) => v.MultipleRowArraySelect
  )
);
const Avatar = dynamic(() => import('@fastgpt/web/components/common/Avatar'));

type CommonSelectProps = {
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
  popDirection?: 'top' | 'bottom';
  ButtonProps?: ButtonProps;
};
type SelectProps<T extends boolean> = CommonSelectProps & {
  isArray?: T;
  value?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType;
  onSelect: (val?: T extends true ? ReferenceArrayValueType : ReferenceItemValueType) => void;
};

export const useReference = ({
  nodeId,
  valueType = WorkflowIOValueTypeEnum.any
}: {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
}) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  // 获取可选的变量列表
  const referenceList = useMemo(() => {
    const sourceNodes = computedNodeInputReference({
      nodeId,
      nodes: nodeList,
      edges: edges,
      chatConfig: appDetail.chatConfig,
      t
    });

    if (!sourceNodes) return [];

    const isArray = valueType?.includes('array');

    // 转换为 select 的数据结构
    const list: CommonSelectProps['list'] = sourceNodes
      .map((node) => {
        return {
          label: (
            <Flex alignItems={'center'}>
              <Avatar src={node.avatar} w={isArray ? '1rem' : '1.05rem'} borderRadius={'xs'} />
              <Box ml={1}>{t(node.name as any)}</Box>
            </Flex>
          ),
          value: node.nodeId,
          children: filterWorkflowNodeOutputsByType(node.outputs, valueType)
            .filter(
              (output) => output.id !== NodeOutputKeyEnum.addOutputParam && output.invalid !== true
            )
            .map((output) => {
              return {
                label: t(output.label as any),
                value: output.id,
                valueType: output.valueType
              };
            })
        };
      })
      .filter((item) => item.children.length > 0);

    return list;
  }, [appDetail.chatConfig, edges, nodeId, nodeList, t, valueType]);

  return {
    referenceList
  };
};

const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();

  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const isArray = item.valueType?.includes('array') ?? false;

  const onSelect = useCallback(
    (e?: ReferenceValueType) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: e
        }
      });
    },
    [item, nodeId, onChangeNode]
  );

  const { referenceList } = useReference({
    nodeId,
    valueType: item.valueType
  });

  const popDirection = useMemo(() => {
    const node = nodeList.find((node) => node.nodeId === nodeId);
    if (!node) return 'bottom';
    return node.flowNodeType === FlowNodeTypeEnum.loop ? 'top' : 'bottom';
  }, [nodeId, nodeList]);

  return (
    <ReferSelector
      placeholder={t(item.referencePlaceholder as any) || t('common:select_reference_variable')}
      list={referenceList}
      value={item.value}
      onSelect={onSelect}
      popDirection={popDirection}
      isArray={isArray}
    />
  );
};

export default React.memo(Reference);

const SingleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  onSelect,
  popDirection,
  ButtonProps
}: SelectProps<false>) => {
  const getSelectValue = useCallback(
    (value: ReferenceValueType) => {
      if (!value) return [];

      const firstColumn = list.find((item) => item.value === value[0]);
      if (!firstColumn) {
        return [];
      }
      const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
      if (!secondColumn) {
        return [];
      }
      return [firstColumn.label, secondColumn.label];
    },
    [list]
  );

  const ItemSelector = useMemo(() => {
    const selectorVal = value as ReferenceItemValueType;
    const [nodeName, outputName] = getSelectValue(selectorVal);
    const isValidSelect = nodeName && outputName;

    return (
      <MultipleRowSelect
        label={
          isValidSelect ? (
            <Flex py={1} pl={1} alignItems={'center'} fontSize={'sm'}>
              {nodeName}
              <MyIcon name={'common/rightArrowLight'} mx={0.5} w={'12px'} color={'myGray.500'} />
              {outputName}
            </Flex>
          ) : (
            <Box fontSize={'sm'} color={'myGray.400'}>
              {placeholder}
            </Box>
          )
        }
        value={selectorVal}
        list={list}
        onSelect={onSelect as any}
        popDirection={popDirection}
        ButtonProps={ButtonProps}
      />
    );
  }, [ButtonProps, getSelectValue, list, onSelect, placeholder, popDirection, value]);

  return ItemSelector;
};
const MultipleReferenceSelector = ({
  placeholder,
  value,
  list = [],
  onSelect,
  popDirection
}: SelectProps<true>) => {
  const getSelectValue = useCallback(
    (value: ReferenceValueType) => {
      if (!value) return [];

      const firstColumn = list.find((item) => item.value === value[0]);
      if (!firstColumn) {
        return [];
      }
      const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
      if (!secondColumn) {
        return [];
      }
      return [firstColumn.label, secondColumn.label];
    },
    [list]
  );

  // Get valid item and remove invalid item
  const formatList = useMemo(() => {
    if (!value || !Array.isArray(value)) return [];

    return value.map((item) => {
      const [nodeName, outputName] = getSelectValue(item);
      return {
        rawValue: item,
        nodeName,
        outputName
      };
    });
  }, [getSelectValue, value]);

  useEffect(() => {
    // Adapt array type from old version
    if (Array.isArray(value) && typeof value[0] === 'string') {
      // @ts-ignore
      onSelect([value]);
    }
  }, [formatList, onSelect, value]);

  const invalidList = useMemo(() => {
    return formatList.filter((item) => item.nodeName && item.outputName);
  }, [formatList]);

  const ArraySelector = useMemo(() => {
    return (
      <MultipleRowArraySelect
        label={
          invalidList.length > 0 ? (
            <Grid py={3} gridTemplateColumns={'1fr 1fr'} gap={2} fontSize={'sm'}>
              {invalidList.map(({ nodeName, outputName }, index) => {
                return (
                  <Flex
                    alignItems={'center'}
                    key={index}
                    bg={'primary.50'}
                    color={'myGray.900'}
                    py={1}
                    px={1.5}
                    rounded={'sm'}
                  >
                    <Flex
                      alignItems={'center'}
                      flex={'1 0 0'}
                      maxW={'200px'}
                      className="textEllipsis"
                    >
                      {nodeName}
                      <MyIcon
                        name={'common/rightArrowLight'}
                        mx={1}
                        w={'12px'}
                        color={'myGray.500'}
                      />
                      {outputName}
                    </Flex>
                    <MyIcon
                      name={'common/closeLight'}
                      w={'1rem'}
                      ml={1}
                      cursor={'pointer'}
                      color={'myGray.500'}
                      _hover={{
                        color: 'red.600'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(value?.filter((_, i) => i !== index));
                      }}
                    />
                  </Flex>
                );
              })}
            </Grid>
          ) : (
            <Box fontSize={'sm'} color={'myGray.400'}>
              {placeholder}
            </Box>
          )
        }
        value={value as any}
        list={list}
        onSelect={onSelect as any}
        popDirection={popDirection}
      />
    );
  }, [invalidList, list, onSelect, placeholder, popDirection, value]);

  return ArraySelector;
};
export const ReferSelector = <T extends boolean>(props: SelectProps<T>) => {
  return props.isArray ? (
    <MultipleReferenceSelector {...(props as SelectProps<true>)} />
  ) : (
    <SingleReferenceSelector {...(props as SelectProps<false>)} />
  );
};
