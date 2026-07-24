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
import { useTranslation } from 'next-i18next';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import VariableTable from './VariableTable';
import { useContextSelector } from 'use-context-selector';
import IOTitle from '../../components/IOTitle';
import dynamic from 'next/dynamic';
import { defaultInput } from './InputEditModal';
import RenderOutput from '../render/RenderOutput';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import {
  canInputBeAgentGenerated,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const FieldEditModal = dynamic(() => import('./InputEditModal'));

/* 
    1. When the plug-in is called, the input of the rendering node is customized.
    2. Customize input nodes. Input and output must be symmetrical.
    3. When the plug-in is run, the external will calculate the value of the custom input and throw it to the output of the custom input node to start running the plug-in.
*/

const NodePluginInput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs = [], outputs } = data;

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  const isUsedAsTool = useMemo(
    () =>
      edges.some(
        (edge) => edge.target === nodeId && edge.targetHandle === NodeOutputKeyEnum.selectedTools
      ),
    [edges, nodeId]
  );

  const onSubmit = useCallback(
    (data: FlowNodeInputItemType) => {
      if (!editField) return;

      if (editField?.key) {
        const output = outputs.find((output) => output.key === editField.key);
        const newOutput: FlowNodeOutputItemType = {
          ...(output as FlowNodeOutputItemType),
          valueType: data.valueType,
          key: data.key,
          label: data.label
        };
        onChangeNode({
          nodeId,
          type: 'replaceInput',
          key: editField.key,
          value: data
        });
        onChangeNode({
          nodeId,
          type: 'replaceOutput',
          key: editField.key,
          value: newOutput
        });
      } else {
        const newOutput: FlowNodeOutputItemType = {
          id: data.key,
          valueType: data.valueType,
          key: data.key,
          label: data.label,
          type: FlowNodeOutputTypeEnum.hidden
        };

        // add_new_input
        onChangeNode({
          nodeId,
          type: 'addInput',
          value: data
        });
        onChangeNode({
          nodeId,
          type: 'addOutput',
          value: newOutput
        });
      }
    },
    [editField, nodeId, onChangeNode, outputs]
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
              const normalizedInput =
                isUsedAsTool || input.key === NodeInputKeyEnum.userChatInput
                  ? initToolInputTypeByDefaultMode(input, {
                      allowUserChatInputAgentGenerated: isUsedAsTool
                    })
                  : input;
              const inputType = normalizedInput.renderTypeList[0];
              return {
                icon: FlowNodeInputMap[inputType]?.icon as string,
                label: t(normalizedInput.label as any),
                type: normalizedInput.valueType
                  ? t(FlowValueTypeMap[normalizedInput.valueType]?.label as any)
                  : '-',
                isTool:
                  isUsedAsTool &&
                  isAgentGeneratedToolInput(normalizedInput) &&
                  canInputBeAgentGenerated(normalizedInput),
                key: normalizedInput.key
              };
            })}
            onEdit={(key) => {
              const input = inputs.find((input) => input.key === key);
              if (!input) return;
              setEditField(
                isUsedAsTool || input.key === NodeInputKeyEnum.userChatInput
                  ? initToolInputTypeByDefaultMode(input, {
                      allowUserChatInputAgentGenerated: isUsedAsTool
                    })
                  : input
              );
            }}
            onDelete={(key) => {
              onChangeNode({
                nodeId,
                type: 'delInput',
                key
              });
              onChangeNode({
                nodeId,
                type: 'delOutput',
                key
              });
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
  }, [data, inputs, isUsedAsTool, nodeId, onChangeNode, outputs, selected, t]);

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
          showAgentGenerated={isUsedAsTool}
          onClose={() => setEditField(undefined)}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
};
export default React.memo(NodePluginInput);
