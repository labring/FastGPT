import React, { useCallback, useState } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { Box, Button, Flex } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import Container from '../../components/Container';
import {
  type FlowNodeInputItemType,
  type ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import IOTitle from '../../components/IOTitle';
import { ReferSelector, useReference } from '../render/RenderInput/templates/Reference';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ValueTypeLabel from '../render/ValueTypeLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import PluginOutputEditModal, { defaultOutput } from './PluginOutputEditModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';

const customOutputConfig = {
  selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),

  showDefaultValue: true
};

const NodePluginOutput = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

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
            onClick={() => setEditField(defaultOutput)}
          >
            {t('common:add_new')}
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
        <PluginOutputEditModal
          customOutputConfig={customOutputConfig}
          defaultOutput={editField}
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

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  const onSelect = useCallback(
    (e?: ReferenceValueType) => {
      if (!e) return;
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: {
          ...input,
          value: e
        }
      });
    },
    [input, nodeId, onChangeNode]
  );

  const { referenceList } = useReference({
    nodeId,
    valueType: input.valueType
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
      <Flex alignItems={'center'} justify={'space-between'} mb={1}>
        <Flex>
          <FormLabel required={input.required}>{input.label}</FormLabel>
          {input.description && <QuestionTip ml={0.5} label={input.description}></QuestionTip>}
          {/* value */}
          <ValueTypeLabel valueType={input.valueType} valueDesc={input.valueDesc} />

          <MyIconButton
            icon={'common/settingLight'}
            size={'14px'}
            ml={2}
            color={'myGray.600'}
            hoverBg="primary.50"
            hoverColor="primary.500"
            onClick={() => setEditField(input)}
          />

          <PopoverConfirm
            Trigger={
              <Box ml={1}>
                <MyIconButton
                  icon="delete"
                  color={'myGray.600'}
                  hoverBg="red.50"
                  size={'14px'}
                  hoverColor="red.600"
                />
              </Box>
            }
            placement={'bottom'}
            type={'delete'}
            content={t('workflow:confirm_delete_field_tip')}
            onConfirm={onDel}
          />
        </Flex>
        <MyTooltip label={t('workflow:plugin_output_tool')}>
          <MyIcon
            name={
              input.isToolOutput !== false
                ? 'core/workflow/template/toolkitActive'
                : 'core/workflow/template/toolkitInactive'
            }
            w={'14px'}
            color={'myGray.500'}
            cursor={'pointer'}
            mr={2}
            _hover={{ color: 'red.600' }}
            onClick={() => setEditField(input)}
          />
        </MyTooltip>
      </Flex>
      <ReferSelector
        placeholder={t((input.referencePlaceholder as any) || 'select_reference_variable')}
        list={referenceList}
        value={input.value}
        onSelect={onSelect}
        isArray={input.valueType?.includes('array')}
      />

      {!!editField && (
        <PluginOutputEditModal
          defaultOutput={editField}
          customOutputConfig={customOutputConfig}
          keys={keys}
          onClose={() => setEditField(undefined)}
          onSubmit={onUpdateField}
        />
      )}
    </>
  );
}
