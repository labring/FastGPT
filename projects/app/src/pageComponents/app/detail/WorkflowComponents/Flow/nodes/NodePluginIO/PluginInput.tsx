import React, { useCallback, useMemo, useState } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { Box, Button, HStack } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import Container from '../../components/Container';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import VariableTable from './VariableTable';
import IOTitle from '../../components/IOTitle';
import dynamic from 'next/dynamic';
import { defaultInput } from './InputEditModal';
import RenderOutput from '../render/RenderOutput';
import { getOutputDisconnectCommands } from '@/web/core/workflow/utils';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';

const FieldEditModal = dynamic(() => import('./InputEditModal'));

/* 
    1. When the plug-in is called, the input of the rendering node is customized.
    2. Customize input nodes. Input and output must be symmetrical.
    3. When the plug-in is run, the external will calculate the value of the custom input and throw it to the output of the custom input node to start running the plug-in.
*/

const NodePluginInput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useSafeTranslation();
  const { nodeId, inputs = [], outputs } = data;

  const node = useNode(nodeId);
  // 边集合只在提交/删除自定义输入的回调里读，走非订阅 getter：点击时取当前值，组件不订阅结构变更。
  const { getEdges } = useWorkflowActions();
  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  /**
   * 提交插件自定义输入：input 与对称 output 必须同一事务写入，撤销才不会拆成两步。
   * 编辑按原 key 整体替换记录，新增走追加；只有改名时旧 handle 上的连线才需要一起断开。
   */
  const onSubmit = useCallback(
    (data: FlowNodeInputItemType) => {
      if (!editField) return;

      const editKey = editField.key;

      node?.updateNode(
        (current) => {
          const newOutput: FlowNodeOutputItemType = editKey
            ? {
                ...(current.outputs.find(
                  (output) => output.key === editKey
                ) as FlowNodeOutputItemType),
                valueType: data.valueType,
                key: data.key,
                label: data.label
              }
            : {
                id: data.key,
                valueType: data.valueType,
                key: data.key,
                label: data.label,
                type: FlowNodeOutputTypeEnum.hidden
              };

          return {
            inputs: editKey
              ? current.inputs.map((input) => (input.key === editKey ? data : input))
              : current.inputs.concat(data),
            outputs: editKey
              ? current.outputs.map((output) => (output.key === editKey ? newOutput : output))
              : current.outputs.concat(newOutput)
          };
        },
        editKey && editKey !== data.key
          ? {
              disconnectEdges: getOutputDisconnectCommands({
                edges: getEdges(),
                nodeId,
                outputKey: editKey
              })
            }
          : undefined
      );
    },
    [editField, getEdges, node, nodeId]
  );

  const Render = useMemo(() => {
    return (
      <NodeCard
        minW={'300px'}
        selected={selected}
        menuForbid={{
          copy: true,
          delete: true
        }}
        {...data}
      >
        <Container mt={1}>
          <HStack className="nodrag" cursor={'default'} mb={3}>
            <IOTitle text={t('common:core.workflow.Custom inputs')} mb={0} />
            <Box flex={'1 0 0'} />
            <Button
              variant={'whitePrimary'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              size={'sm'}
              onClick={() => setEditField(defaultInput)}
            >
              {t('common:add_new')}
            </Button>
          </HStack>
          <VariableTable
            variables={inputs.map((input) => {
              const inputType = input.renderTypeList[0];
              return {
                icon: FlowNodeInputMap[inputType]?.icon as string,
                label: t(input.label as any),
                type: input.valueType ? t(FlowValueTypeMap[input.valueType]?.label as any) : '-',
                key: input.key
              };
            })}
            onEdit={(key) => {
              const input = inputs.find((input) => input.key === key);
              if (!input) return;
              setEditField(input);
            }}
            onDelete={(key) => {
              // 删除字段时其对称 output 与 handle 连线同事务消失，撤销一步恢复。
              node?.updateNode(
                (current) => ({
                  inputs: current.inputs.filter((input) => input.key !== key),
                  outputs: current.outputs.filter((output) => output.key !== key)
                }),
                {
                  disconnectEdges: getOutputDisconnectCommands({
                    edges: getEdges(),
                    nodeId,
                    outputKey: key
                  })
                }
              );
            }}
          />
        </Container>
        {outputs.length != inputs.length && (
          <Container>
            <IOTitle text={t('common:Output')} />
            <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
          </Container>
        )}
      </NodeCard>
    );
  }, [data, getEdges, inputs, node, nodeId, outputs, selected, t]);

  return (
    <>
      {Render}
      {!!editField && (
        <FieldEditModal
          defaultValue={editField}
          keys={inputs.map((item) => item.key)}
          hasDynamicInput={
            !!inputs.find(
              (input) =>
                input.key !== editField.key &&
                input.renderTypeList.includes(FlowNodeInputTypeEnum.addInputParam)
            )
          }
          showAgentGenerated={false}
          onClose={() => setEditField(undefined)}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
};
export default React.memo(NodePluginInput);
