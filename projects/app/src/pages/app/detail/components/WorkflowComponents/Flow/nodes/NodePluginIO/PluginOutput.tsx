import React, { useCallback, useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import dynamic from 'next/dynamic';
import { Box, Button, Flex } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import Container from '../../components/Container';
import { FlowNodeInputItemType, ReferenceValueProps } from '@fastgpt/global/core/workflow/type/io';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import RenderInput from '../render/RenderInput';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import IOTitle from '../../components/IOTitle';
import { ReferSelector, useReference } from '../render/RenderInput/templates/Reference';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ValueTypeLabel from '../render/ValueTypeLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useI18n } from '@/web/context/I18n';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { isWorkflowStartOutput } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { defaultInput } from '../render/RenderInput/FieldEditModal';

const FieldEditModal = dynamic(() => import('../render/RenderInput/FieldEditModal'));

const customInputConfig = {
  selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
  showDescription: true,
  showDefaultValue: true
};

const NodePluginOutput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs } = data;
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  return (
    <NodeCard
      minW={'300px'}
      selected={selected}
      menuForbid={{
        debug: true,
        copy: true,
        delete: true
      }}
      {...data}
    >
      <Container mt={1}>
        <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
          <IOTitle mb={0} text={t('common:core.workflow.Custom outputs')}></IOTitle>
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
        </Flex>

        {/* render input */}
        <Box mt={2}>
          {inputs.map((input) => (
            <Box key={input.key} _notLast={{ mb: 3 }}>
              <Reference nodeId={nodeId} keys={inputs.map((input) => input.key)} input={input} />
            </Box>
          ))}
        </Box>
      </Container>
      {!!editField && (
        <FieldEditModal
          customInputConfig={customInputConfig}
          defaultInput={editField}
          keys={inputs.map((input) => input.key)}
          onClose={() => setEditField(undefined)}
          onSubmit={({ data }) => {
            onChangeNode({
              nodeId,
              type: 'addInput',
              value: data
            });
          }}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodePluginOutput);

function Reference({
  nodeId,
  keys,
  input
}: {
  nodeId: string;
  keys: string[];
  input: FlowNodeInputItemType;
}) {
  const { t } = useTranslation();
  const { workflowT } = useI18n();
  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: workflowT('confirm_delete_field_tip')
  });
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  const onSelect = useCallback(
    (e: ReferenceValueProps) => {
      const workflowStartNode = nodeList.find(
        (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
      );

      const value =
        e[0] === workflowStartNode?.id && !isWorkflowStartOutput(e[1])
          ? [VARIABLE_NODE_ID, e[1]]
          : e;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: {
          ...input,
          value
        }
      });
    },
    [input, nodeId, nodeList, onChangeNode]
  );

  const { referenceList, formatValue } = useReference({
    nodeId,
    valueType: input.valueType,
    value: input.value
  });

  const onUpdateField = useCallback(
    ({ data }: { data: FlowNodeInputItemType }) => {
      if (!data.key) return;

      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: input.key,
        value: data
      });
    },
    [input.key, nodeId, onChangeNode]
  );
  const onDel = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'delInput',
      key: input.key
    });
  }, [input.key, nodeId, onChangeNode]);

  return (
    <>
      <Flex alignItems={'center'} mb={1}>
        <FormLabel required={input.required}>{input.label}</FormLabel>
        {input.description && <QuestionTip ml={0.5} label={input.description}></QuestionTip>}
        {/* value */}
        <ValueTypeLabel valueType={input.valueType} valueDesc={input.valueDesc} />

        <MyIcon
          name={'common/settingLight'}
          w={'14px'}
          cursor={'pointer'}
          ml={3}
          color={'myGray.600'}
          _hover={{ color: 'primary.500' }}
          onClick={() => setEditField(input)}
        />

        <MyIcon
          className="delete"
          name={'delete'}
          w={'14px'}
          color={'myGray.500'}
          cursor={'pointer'}
          ml={2}
          _hover={{ color: 'red.600' }}
          onClick={openConfirm(onDel)}
        />
      </Flex>
      <ReferSelector
        placeholder={t((input.referencePlaceholder as any) || 'select_reference_variable')}
        list={referenceList}
        value={formatValue}
        onSelect={onSelect}
      />

      {!!editField && (
        <FieldEditModal
          defaultInput={editField}
          customInputConfig={customInputConfig}
          keys={keys}
          onClose={() => setEditField(undefined)}
          onSubmit={onUpdateField}
        />
      )}
      <ConfirmModal />
    </>
  );
}
