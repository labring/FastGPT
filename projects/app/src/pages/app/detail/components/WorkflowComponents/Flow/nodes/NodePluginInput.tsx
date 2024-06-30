import React, { useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { Box, Button, Flex } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io.d';
import Container from '../components/Container';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import type {
  EditInputFieldMapType,
  EditNodeFieldType
} from '@fastgpt/global/core/workflow/node/type.d';
import { useTranslation } from 'next-i18next';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { FlowValueTypeMap } from '@/web/core/workflow/constants/dataType';
import VariableTable from './render/VariableTable';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const defaultCreateField: EditNodeFieldType = {
  label: '',
  key: '',
  description: '',
  inputType: FlowNodeInputTypeEnum.reference,
  valueType: WorkflowIOValueTypeEnum.string,
  required: true
};
const createEditField: EditInputFieldMapType = {
  key: true,
  description: true,
  required: true,
  valueType: true,
  inputType: true
};
const dynamicInputEditField: EditInputFieldMapType = {
  key: true
};

const NodePluginInput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [createField, setCreateField] = useState<EditNodeFieldType>();
  const [editField, setEditField] = useState<EditNodeFieldType>();

  const Render = useMemo(() => {
    return (
      <NodeCard
        minW={'300px'}
        selected={selected}
        menuForbid={{
          rename: true,
          copy: true,
          delete: true
        }}
        {...data}
      >
        <Container mt={1}>
          <Flex className="nodrag" cursor={'default'} alignItems={'center'} mb={3}>
            <Box>{t('core.workflow.Custom inputs')}</Box>
            <Box flex={'1 0 0'} />
            <Button
              variant={'whitePrimary'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              size={'sm'}
              onClick={() => setCreateField(defaultCreateField)}
            >
              {t('common.Add New')}
            </Button>
          </Flex>
          <VariableTable
            fieldEditType={createEditField}
            keys={inputs.map((input) => input.key)}
            onCloseFieldEdit={() => {
              setCreateField(undefined);
              setEditField(undefined);
            }}
            variables={inputs.map((input) => {
              const inputType = input.renderTypeList[0];
              return {
                icon: FlowNodeInputMap[inputType]?.icon as string,
                label: t(input.label),
                type: input.valueType ? t(FlowValueTypeMap[input.valueType]?.label) : '-',
                key: input.key
              };
            })}
            createField={createField}
            onCreate={({ data }) => {
              if (!data.key || !data.inputType) {
                return;
              }

              const newInput: FlowNodeInputItemType = {
                key: data.key,
                valueType: data.valueType,
                label: data.label || '',
                renderTypeList: [data.inputType],
                required: data.required,
                description: data.description,
                toolDescription: data.isToolInput ? data.description : undefined,
                canEdit: true,
                value: data.defaultValue,
                editField: dynamicInputEditField,
                maxLength: data.maxLength,
                max: data.max,
                min: data.min,
                dynamicParamDefaultValue: data.dynamicParamDefaultValue
              };

              onChangeNode({
                nodeId,
                type: 'addInput',
                value: newInput
              });

              const newOutput: FlowNodeOutputItemType = {
                id: getNanoid(),
                key: data.key,
                valueType: data.valueType,
                label: data.label,
                type: FlowNodeOutputTypeEnum.static
              };
              onChangeNode({
                nodeId,
                type: 'addOutput',
                value: newOutput
              });
              setCreateField(undefined);
            }}
            editField={editField}
            onStartEdit={(key) => {
              const input = inputs.find((input) => input.key === key);
              if (!input) return;

              setEditField({
                ...input,
                inputType: input.renderTypeList[0],
                isToolInput: !!input.toolDescription
              });
            }}
            onEdit={({ data, changeKey }) => {
              if (!data.inputType || !data.key || !editField?.key) return;

              const output = outputs.find((output) => output.key === editField.key);

              const newInput: FlowNodeInputItemType = {
                ...data,
                key: data.key,
                label: data.label || '',
                renderTypeList: [data.inputType],
                toolDescription: data.isToolInput ? data.description : undefined,
                canEdit: true,
                value: data.defaultValue,
                editField: dynamicInputEditField
              };
              const newOutput: FlowNodeOutputItemType = {
                ...(output as FlowNodeOutputItemType),
                valueType: data.valueType,
                key: data.key,
                label: data.label
              };

              if (changeKey) {
                onChangeNode({
                  nodeId,
                  type: 'replaceInput',
                  key: editField.key,
                  value: newInput
                });
                onChangeNode({
                  nodeId,
                  type: 'replaceOutput',
                  key: editField.key,
                  value: newOutput
                });
              } else {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: newInput.key,
                  value: newInput
                });
                onChangeNode({
                  nodeId,
                  type: 'updateOutput',
                  key: newOutput.key,
                  value: newOutput
                });
              }
              setEditField(undefined);
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
      </NodeCard>
    );
  }, [createField, data, editField, inputs, nodeId, onChangeNode, outputs, selected, t]);

  return Render;
};
export default React.memo(NodePluginInput);
