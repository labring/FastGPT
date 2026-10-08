import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { Box, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import React, { useEffect, useMemo } from 'react';
import {
  FlowNodeOutputTypeEnum,
  FlowValueTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getOutputDisconnectCommands } from '@/web/core/workflow/utils';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';

const typeMap = {
  [WorkflowIOValueTypeEnum.arrayString]: WorkflowIOValueTypeEnum.string,
  [WorkflowIOValueTypeEnum.arrayNumber]: WorkflowIOValueTypeEnum.number,
  [WorkflowIOValueTypeEnum.arrayBoolean]: WorkflowIOValueTypeEnum.boolean,
  [WorkflowIOValueTypeEnum.arrayObject]: WorkflowIOValueTypeEnum.object,
  [WorkflowIOValueTypeEnum.arrayAny]: WorkflowIOValueTypeEnum.any
};

const NodeLoopStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs, parentNodeId } = data;
  // 数组元素类型来自父容器的 nestedInputArray：直接订阅父节点文档数据。
  const node = useNode(nodeId);
  const parentNode = useNode(parentNodeId ?? '');
  // 边集合只在删除 nestedStartInput 输出时读，走非订阅 getter：effect 不再随边增删重跑。
  const { getEdges } = useWorkflowActions();

  // According to the variable referenced by parentInput, find the output of the corresponding node and take its output valueType
  const loopItemInputType = useMemo(() => {
    const parentArrayInput = parentNode?.data.inputs.find(
      (input) => input.key === NodeInputKeyEnum.nestedInputArray
    );
    return typeMap[parentArrayInput?.valueType as keyof typeof typeMap];
  }, [parentNode]);

  // Auth update loopStartInput output
  useEffect(() => {
    const documentOutputs = node?.data.outputs;
    if (!documentOutputs) return;

    const loopArrayOutput = documentOutputs.find(
      (output) => output.key === NodeOutputKeyEnum.nestedStartInput
    );

    // 删除 / 新增 / 改类型三种情况收敛成一次整表提交：一次父节点变更只产生一条历史。
    let nextOutputs: typeof documentOutputs | undefined;
    if (!loopItemInputType && loopArrayOutput) {
      nextOutputs = documentOutputs.filter(
        (output) => output.key !== NodeOutputKeyEnum.nestedStartInput
      );
    } else if (loopItemInputType && !loopArrayOutput) {
      nextOutputs = documentOutputs.concat({
        id: NodeOutputKeyEnum.nestedStartInput,
        key: NodeOutputKeyEnum.nestedStartInput,
        label: t('workflow:Array_element'),
        type: FlowNodeOutputTypeEnum.static,
        valueType: loopItemInputType
      });
    } else if (loopItemInputType && loopArrayOutput?.valueType !== loopItemInputType) {
      nextOutputs = documentOutputs.map((output) =>
        output.key === NodeOutputKeyEnum.nestedStartInput
          ? { ...output, valueType: loopItemInputType }
          : output
      );
    }
    if (!nextOutputs) return;

    node?.updateNode(
      () => ({ outputs: nextOutputs }),
      // 删除该输出时，旧 handle 上的连线同事务断开。
      !loopItemInputType
        ? {
            disconnectEdges: getOutputDisconnectCommands({
              edges: getEdges(),
              nodeId,
              outputKey: NodeOutputKeyEnum.nestedStartInput
            })
          }
        : undefined
    );
  }, [getEdges, loopItemInputType, node, nodeId, t]);

  const Render = useMemo(() => {
    return (
      <NodeCard
        selected={selected}
        {...data}
        menuForbid={{
          copy: true,
          delete: true,
          debug: true
        }}
      >
        <Box px={4} pt={2} w={'420px'}>
          <Box bg={'white'} borderRadius={'md'} overflow={'hidden'} border={'base'}>
            <FixedTableContainer flush className="nodrag nowheel">
              <Table bg={'white'} variant={'workflow'}>
                <Thead>
                  <Tr>
                    <Th>{t('workflow:Variable_name')}</Th>
                    <Th>{t('common:core.workflow.Value type')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {outputs.map((output) => (
                    <Tr key={output.id}>
                      <Td>
                        <Flex alignItems={'center'}>
                          <MyIcon
                            name={'core/workflow/inputType/array'}
                            w={'14px'}
                            mr={1}
                            color={'primary.600'}
                          />
                          {t(output.label as any)}
                        </Flex>
                      </Td>
                      {output.valueType && <Td>{FlowValueTypeMap[output.valueType]?.label}</Td>}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </FixedTableContainer>
          </Box>
        </Box>
      </NodeCard>
    );
  }, [data, outputs, selected, t]);

  return Render;
};

export default React.memo(NodeLoopStart);
