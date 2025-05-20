import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../../type';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import {
  type FlowNodeInputItemType,
  type ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import { defaultInput } from '../../FieldEditModal';
import { getInputComponentProps } from '@fastgpt/global/core/workflow/node/io/utils';
import { ReferSelector, useReference } from '../Reference';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import ValueTypeLabel from '../../../ValueTypeLabel';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const FieldEditModal = dynamic(() => import('../../FieldEditModal'));

const DynamicInputs = (props: RenderInputProps) => {
  const { item, inputs = [], nodeId } = props;
  const { t } = useTranslation();
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
            <Box>{item.label || t('workflow:custom_input')}</Box>
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
            {t('common:add_new')}
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
  }, [editField, dynamicInputs, item, keys, onAddField, props, t]);

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

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const keys = useMemo(() => {
    return inputs.map((input) => input.key);
  }, [inputs]);
  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  const onSelect = useCallback(
    (e?: ReferenceValueType) => {
      if (!e) return;
      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: {
          ...inputChildren,
          value: e
        }
      });
    },
    [inputChildren, nodeId, onChangeNode]
  );

  const { referenceList } = useReference({
    nodeId,
    valueType: inputChildren.valueType
  });

  const onUpdateField = useCallback(
    ({ data }: { data: FlowNodeInputItemType }) => {
      if (!data.key) return;
      const oldType = inputChildren.valueType;
      const newType = data.valueType;
      let newValue = data.value;
      if (oldType?.includes('array') && !newType?.includes('array')) {
        newValue = data.value[0];
      } else if (!oldType?.includes('array') && newType?.includes('array')) {
        newValue = [data.value];
      }

      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: {
          ...inputChildren,
          value: newValue,
          key: data.key,
          label: data.label,
          valueType: data.valueType
        }
      });
    },
    [inputChildren, nodeId, onChangeNode]
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

        <MyIconButton
          icon="common/settingLight"
          ml={2}
          color={'myGray.600'}
          hoverBg="primary.50"
          hoverColor="primary.500"
          size={'14px'}
          onClick={() => setEditField(inputChildren)}
        />

        <PopoverConfirm
          Trigger={
            <Box ml={1}>
              <MyIconButton
                icon="delete"
                color={'myGray.600'}
                hoverBg="red.50"
                hoverColor="red.600"
                size={'14px'}
              />
            </Box>
          }
          type={'delete'}
          content={t('workflow:confirm_delete_field_tip')}
          onConfirm={onDel}
        />
      </Flex>
      <ReferSelector
        placeholder={t((inputChildren.referencePlaceholder as any) || 'select_reference_variable')}
        list={referenceList}
        value={inputChildren.value}
        onSelect={onSelect}
        isArray={inputChildren.valueType?.includes('array')}
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
    </>
  );
}
