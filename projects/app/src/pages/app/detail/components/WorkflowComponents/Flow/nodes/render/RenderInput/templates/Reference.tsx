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
const Avatar = dynamic(() => import('@/components/Avatar'));

type SelectProps = {
  value?: ReferenceValueProps;
  placeholder?: string;
  list: {
    label: string | React.ReactNode;
    value: string;
    children: {
      label: string;
      value: string;
    }[];
  }[];
  onSelect: (val: ReferenceValueProps) => void;
  styles?: ButtonProps;
};

const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const onSelect = useCallback(
    (e: ReferenceValueProps) => {
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

  return (
    <ReferSelector
      placeholder={t(item.referencePlaceholder || '选择引用变量')}
      list={referenceList}
      value={formatValue}
      onSelect={onSelect}
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
              <Avatar mr={1} src={node.avatar} w={'14px'} borderRadius={'ms'} />
              <Box>{t(node.name)}</Box>
            </Flex>
          ),
          value: node.nodeId,
          children: node.outputs
            .filter(
              (output) =>
                valueType === WorkflowIOValueTypeEnum.any ||
                output.valueType === WorkflowIOValueTypeEnum.any ||
                output.valueType === valueType
            )
            .filter((output) => output.id !== NodeOutputKeyEnum.addOutputParam)
            .map((output) => {
              return {
                label: t(output.label || ''),
                value: output.id
              };
            })
        };
      })
      .filter((item) => item.children.length > 0);

    return list;
  }, [appDetail.chatConfig, edges, nodeId, nodeList, t, valueType]);

  const formatValue = useMemo(() => {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string'
    ) {
      return value as ReferenceValueProps;
    }
    return undefined;
  }, [value]);

  return {
    referenceList,
    formatValue
  };
};
export const ReferSelector = ({ placeholder, value, list = [], onSelect }: SelectProps) => {
  const selectItemLabel = useMemo(() => {
    if (!value) {
      return;
    }
    const firstColumn = list.find((item) => item.value === value[0]);
    if (!firstColumn) {
      return;
    }
    const secondColumn = firstColumn.children.find((item) => item.value === value[1]);
    if (!secondColumn) {
      return;
    }
    return [firstColumn, secondColumn];
  }, [list, value]);

  const Render = useMemo(() => {
    return (
      <MultipleRowSelect
        label={
          selectItemLabel ? (
            <Flex alignItems={'center'}>
              {selectItemLabel[0].label}
              <MyIcon name={'common/rightArrowLight'} mx={1} w={'14px'}></MyIcon>
              {selectItemLabel[1].label}
            </Flex>
          ) : (
            <Box>{placeholder}</Box>
          )
        }
        value={value as any[]}
        list={list}
        onSelect={(e) => {
          onSelect(e as ReferenceValueProps);
        }}
      />
    );
  }, [list, onSelect, placeholder, selectItemLabel, value]);

  return Render;
};
