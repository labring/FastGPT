import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../../type';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeInputItemType, ReferenceValueProps } from '@fastgpt/global/core/workflow/type/io';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { defaultInput } from '../../FieldEditModal';
import { getInputComponentProps } from '@fastgpt/global/core/workflow/node/io/utils';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { ReferSelector, useReference } from '../Reference';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import ValueTypeLabel from '../../../ValueTypeLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useI18n } from '@/web/context/I18n';
import { isWorkflowStartOutput } from '@fastgpt/global/core/workflow/template/system/workflowStart';

const FieldEditModal = dynamic(() => import('../../FieldEditModal'));

const DynamicInputs = (props: RenderInputProps) => {
  const { item, inputs = [], nodeId } = props;
  const { t } = useTranslation();
  const { workflowT } = useI18n();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const dynamicInputs = useMemo(() => inputs.filter((item) => item.canEdit), [inputs]);
  const keys = useMemo(() => {
    return inputs.map((input) => input.key);
  }, [inputs]);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  const onAddField = useCallback(
    ({ data }: { data: FlowNodeInputItemType }) => {
      if (!data.key) return;

      const newInput: FlowNodeInputItemType = {
        ...data,
        required: true
      };

      onChangeNode({
        nodeId,
        type: 'addInput',
        value: newInput
      });
    },
    [nodeId, onChangeNode]
  );

  const Render = useMemo(() => {
    return (
      <Box borderBottom={'base'} pb={3}>
        <HStack className="nodrag" cursor={'default'} position={'relative'}>
          <HStack spacing={1} position={'relative'} fontWeight={'medium'} color={'myGray.600'}>
            <Box>{item.label || workflowT('custom_input')}</Box>
            {item.description && <QuestionTip label={t(item.description as any)} />}
          </HStack>
          <Box flex={'1 0 0'} />
          <Button
            variant={'whiteBase'}
            leftIcon={<SmallAddIcon />}
            iconSpacing={1}
            size={'sm'}
            onClick={() =>
              setEditField({
                ...defaultInput,
                ...getInputComponentProps(item)
              })
            }
          >
            {t('common:common.Add New')}
          </Button>
        </HStack>
        {/* field render */}
        <Box mt={2}>
          {dynamicInputs.map((children) => (
            <Box key={children.key} _notLast={{ mb: 3 }}>
              <Reference {...props} inputChildren={children} />
            </Box>
          ))}
        </Box>

        {!!editField && !!item.customInputConfig && (
          <FieldEditModal
            defaultInput={editField}
            customInputConfig={item.customInputConfig}
            keys={keys}
            onClose={() => setEditField(undefined)}
            onSubmit={onAddField}
          />
        )}
      </Box>
    );
  }, [editField, dynamicInputs, item, keys, onAddField, props, t, workflowT]);

  return Render;
};

export default React.memo(DynamicInputs);

function Reference({
  inputChildren,
  ...props
}: RenderInputProps & {
  inputChildren: FlowNodeInputItemType;
}) {
  const { nodeId, inputs = [], item } = props;
  const { t } = useTranslation();
  const { workflowT } = useI18n();
  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: workflowT('confirm_delete_field_tip')
  });
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const keys = useMemo(() => {
    return inputs.map((input) => input.key);
  }, [inputs]);
  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  const onSelect = useCallback(
    (e: ReferenceValueProps) => {
      const workflowStartNode = nodeList.find(
        (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
      );

      const newValue =
        e[0] === workflowStartNode?.id && !isWorkflowStartOutput(e[1])
          ? [VARIABLE_NODE_ID, e[1]]
          : e;

      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: {
          ...inputChildren,
          value: newValue
        }
      });
    },
    [inputChildren, nodeId, nodeList, onChangeNode]
  );

  const { referenceList, formatValue } = useReference({
    nodeId,
    valueType: inputChildren.valueType,
    value: inputChildren.value
  });

  const onUpdateField = useCallback(
    ({ data }: { data: FlowNodeInputItemType }) => {
      if (!data.key) return;

      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: data
      });
    },
    [inputChildren.key, nodeId, onChangeNode]
  );
  const onDel = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'delInput',
      key: inputChildren.key
    });
  }, [inputChildren.key, nodeId, onChangeNode]);

  return (
    <>
      <Flex alignItems={'center'} mb={1}>
        <FormLabel required={inputChildren.required}>{inputChildren.label}</FormLabel>
        {inputChildren.description && (
          <QuestionTip ml={1} label={inputChildren.description}></QuestionTip>
        )}
        {/* value */}
        <ValueTypeLabel valueType={inputChildren.valueType} valueDesc={inputChildren.valueDesc} />

        <MyIcon
          name={'common/settingLight'}
          w={'14px'}
          cursor={'pointer'}
          ml={3}
          color={'myGray.600'}
          _hover={{ color: 'primary.500' }}
          onClick={() => setEditField(inputChildren)}
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
        placeholder={t((inputChildren.referencePlaceholder as any) || 'select_reference_variable')}
        list={referenceList}
        value={formatValue}
        onSelect={onSelect}
      />

      {!!editField && !!item.customInputConfig && (
        <FieldEditModal
          defaultInput={editField}
          customInputConfig={item.customInputConfig}
          keys={keys}
          onClose={() => setEditField(undefined)}
          onSubmit={onUpdateField}
        />
      )}
      <ConfirmModal />
    </>
  );
}
