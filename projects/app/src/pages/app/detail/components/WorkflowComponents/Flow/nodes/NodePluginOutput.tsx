import React, { useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import dynamic from 'next/dynamic';
import { Box, Button, Flex } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import Container from '../components/Container';
import { EditInputFieldMapType, EditNodeFieldType } from '@fastgpt/global/core/workflow/node/type';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import RenderInput from './render/RenderInput';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const FieldEditModal = dynamic(() => import('./render/FieldEditModal'));

const defaultCreateField: EditNodeFieldType = {
  inputType: FlowNodeInputTypeEnum.reference,
  key: '',
  description: '',
  valueType: WorkflowIOValueTypeEnum.string
};
const createEditField: EditInputFieldMapType = {
  key: true,
  description: true,
  valueType: true
};

const NodePluginOutput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs } = data;
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [createField, setCreateField] = useState<EditNodeFieldType>();

  return (
    <NodeCard
      minW={'300px'}
      selected={selected}
      menuForbid={{
        debug: true,
        rename: true,
        copy: true,
        delete: true
      }}
      {...data}
    >
      <Container mt={1}>
        <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
          <Box position={'relative'} fontWeight={'medium'}>
            {t('core.workflow.Custom outputs')}
          </Box>
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
        <RenderInput nodeId={nodeId} flowInputList={inputs} />
      </Container>
      {!!createField && (
        <FieldEditModal
          editField={createEditField}
          defaultField={createField}
          keys={inputs.map((input) => input.key)}
          onClose={() => setCreateField(undefined)}
          onSubmit={({ data }) => {
            if (!data.key || !data.label) {
              return;
            }

            const newInput: FlowNodeInputItemType = {
              key: data.key,
              valueType: data.valueType,
              label: data.label,
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              required: false,
              description: data.description,
              canEdit: true,
              editField: createEditField
            };

            onChangeNode({
              nodeId,
              type: 'addInput',
              value: newInput
            });

            setCreateField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodePluginOutput);
