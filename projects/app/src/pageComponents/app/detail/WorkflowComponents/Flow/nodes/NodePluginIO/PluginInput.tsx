import React, { useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { Box, Button, HStack } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io.d';
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
import { WorkflowContext } from '../../../context';
import IOTitle from '../../components/IOTitle';
import dynamic from 'next/dynamic';
import { defaultInput } from './InputEditModal';
import RenderOutput from '../render/RenderOutput';

const FieldEditModal = dynamic(() => import('./InputEditModal'));

/* 
    1. When the plug-in is called, the input of the rendering node is customized.
    2. Customize input nodes. Input and output must be symmetrical.
    3. When the plug-in is run, the external will calculate the value of the custom input and throw it to the output of the custom input node to start running the plug-in.
*/

const NodePluginInput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs = [], outputs } = data;

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  const onSubmit = (data: FlowNodeInputItemType) => {
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
  };

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
              {t('common:common.Add New')}
            </Button>
          </HStack>
          <VariableTable
            variables={inputs.map((input) => {
              const inputType = input.renderTypeList[0];
              return {
                icon: FlowNodeInputMap[inputType]?.icon as string,
                label: t(input.label as any),
                type: input.valueType ? t(FlowValueTypeMap[input.valueType]?.label as any) : '-',
                isTool: !!input.toolDescription,
                key: input.key
              };
            })}
            onEdit={(key) => {
              const input = inputs.find((input) => input.key === key);
              if (!input) return;
              setEditField(input);
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
            <IOTitle text={t('common:common.Output')} />
            <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
          </Container>
        )}
      </NodeCard>
    );
  }, [data, inputs, nodeId, onChangeNode, outputs, selected, t]);

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
          onClose={() => setEditField(undefined)}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
};
export default React.memo(NodePluginInput);
