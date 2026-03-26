import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { useContextSelector } from 'use-context-selector';
import { WorkflowInitContext } from '../../../context/workflowInitContext';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { Box, Flex, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import React, { useEffect, useMemo } from 'react';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  FlowValueTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';

const typeMap = {
  [WorkflowIOValueTypeEnum.arrayString]: WorkflowIOValueTypeEnum.string,
  [WorkflowIOValueTypeEnum.arrayNumber]: WorkflowIOValueTypeEnum.number,
  [WorkflowIOValueTypeEnum.arrayBoolean]: WorkflowIOValueTypeEnum.boolean,
  [WorkflowIOValueTypeEnum.arrayObject]: WorkflowIOValueTypeEnum.object,
  [WorkflowIOValueTypeEnum.arrayAny]: WorkflowIOValueTypeEnum.any
};

const NodeLoopStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  // 必须用 WorkflowInitContext：Buffer 里 getNodeById 依赖的 compareNodeList 不含 input.value，
  // 切换循环类型时父节点 inputs.value 变了但 compareNodeList 不变，会导致闭包读到旧的 nodesMap。
  const loopStartLive = useContextSelector(
    WorkflowInitContext,
    (ctx) => ctx.rawNodesMap[nodeId]?.data
  );
  const parentLive = useContextSelector(WorkflowInitContext, (ctx) => {
    const pid = ctx.rawNodesMap[nodeId]?.data.parentNodeId;
    return pid ? ctx.rawNodesMap[pid]?.data : undefined;
  });

  const isUnderLoopPro = parentLive?.flowNodeType === FlowNodeTypeEnum.loopPro;
  const isUnderBatchOrLoop =
    parentLive?.flowNodeType === FlowNodeTypeEnum.loop ||
    parentLive?.flowNodeType === FlowNodeTypeEnum.batch;
  const displayName = isUnderBatchOrLoop
    ? t('workflow:loop_graph_start')
    : t('workflow:loop_start');

  const isLoopProConditionMode = useMemo(() => {
    if (parentLive?.flowNodeType !== FlowNodeTypeEnum.loopPro) return false;
    const mode = parentLive.inputs.find((i) => i.key === NodeInputKeyEnum.loopProMode)?.value;
    return mode === 'condition';
  }, [parentLive]);

  // According to the variable referenced by parentInput, find the output of the corresponding node and take its output valueType
  const loopItemInputType = useMemo(() => {
    const parentArrayInput = parentLive?.inputs.find(
      (input) => input.key === NodeInputKeyEnum.loopInputArray
    );
    return typeMap[parentArrayInput?.valueType as keyof typeof typeMap];
  }, [parentLive]);

  // 条件循环(Pro) 下不展示「数组元素」，仅「当前循环次数」；父级仍有 array 类型输入，不能单靠 loopItemInputType 判断
  const effectiveLoopItemType = isLoopProConditionMode ? undefined : loopItemInputType;

  // Auth update loopStartInput output
  useEffect(() => {
    const loopArrayOutput = loopStartLive?.outputs.find(
      (output) => output.key === NodeOutputKeyEnum.loopStartInput
    );

    // if effectiveLoopItemType is undefined, delete loopStartInput output
    if (!effectiveLoopItemType && loopArrayOutput) {
      onChangeNode({
        nodeId,
        type: 'delOutput',
        key: NodeOutputKeyEnum.loopStartInput
      });
    }
    // if effectiveLoopItemType is not undefined, and has no loopArrayOutput, add loopStartInput output
    if (effectiveLoopItemType && !loopArrayOutput) {
      onChangeNode({
        nodeId,
        type: 'addOutput',
        value: {
          id: NodeOutputKeyEnum.loopStartInput,
          key: NodeOutputKeyEnum.loopStartInput,
          label: t('workflow:Array_element'),
          type: FlowNodeOutputTypeEnum.static,
          valueType: effectiveLoopItemType
        }
      });
    }
    // if effectiveLoopItemType is not undefined, and has loopArrayOutput, update loopStartInput output
    if (effectiveLoopItemType && loopArrayOutput) {
      onChangeNode({
        nodeId,
        type: 'updateOutput',
        key: NodeOutputKeyEnum.loopStartInput,
        value: {
          ...loopArrayOutput,
          valueType: effectiveLoopItemType
        }
      });
    }
  }, [loopStartLive?.outputs, nodeId, onChangeNode, effectiveLoopItemType, t]);

  const tableOutputs = useMemo(() => {
    const list = loopStartLive?.outputs ?? outputs;
    if (isLoopProConditionMode) {
      return list.filter((o) => o.key === NodeOutputKeyEnum.loopStartIndex);
    }
    return list;
  }, [isLoopProConditionMode, loopStartLive?.outputs, outputs]);

  const Render = useMemo(() => {
    return (
      <NodeCard
        selected={selected}
        {...data}
        name={displayName}
        avatar={isUnderLoopPro ? 'core/workflow/template/loopProStart' : data.avatar}
        avatarLinear={data.avatarLinear}
        colorSchema={isUnderLoopPro ? 'workflowLoop' : data.colorSchema}
        menuForbid={{
          copy: true,
          delete: true,
          debug: true
        }}
      >
        <Box px={4} pt={2} w={'420px'}>
          <Box bg={'white'} borderRadius={'md'} overflow={'hidden'} border={'base'}>
            <TableContainer>
              <Table bg={'white'}>
                <Thead>
                  <Tr>
                    <Th borderBottomLeftRadius={'none !important'}>
                      {t('workflow:Variable_name')}
                    </Th>
                    <Th>{t('common:core.workflow.Value type')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {tableOutputs.map((output) => {
                    const isIndexRow = output.key === NodeOutputKeyEnum.loopStartIndex;
                    const rowIcon = (() => {
                      if (isLoopProConditionMode && isIndexRow) {
                        return 'core/workflow/inputType/ifloop' as const;
                      }
                      return 'core/workflow/inputType/array' as const;
                    })();
                    const rowLabel = (() => {
                      if (isLoopProConditionMode && isIndexRow) {
                        return t('workflow:current_loop_round');
                      }
                      return t(output.label as any);
                    })();
                    return (
                      <Tr key={output.id}>
                        <Td>
                          <Flex alignItems={'center'}>
                            <MyIcon
                              name={rowIcon}
                              w={'14px'}
                              mr={1}
                              color={isUnderLoopPro ? 'teal.500' : 'primary.600'}
                            />
                            {rowLabel}
                          </Flex>
                        </Td>
                        {output.valueType && <Td>{FlowValueTypeMap[output.valueType]?.label}</Td>}
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      </NodeCard>
    );
  }, [data, displayName, isLoopProConditionMode, isUnderLoopPro, selected, t, tableOutputs]);

  return Render;
};

export default React.memo(NodeLoopStart);
