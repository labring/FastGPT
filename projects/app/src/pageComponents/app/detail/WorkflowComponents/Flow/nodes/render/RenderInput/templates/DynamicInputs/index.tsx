import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../../type';
import { Box, Flex, HStack, Input } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import {
  type FlowNodeInputItemType,
  type ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import { getInputComponentProps } from '@/web/core/workflow/utils';
import { ReferSelector, useReference } from '../Reference';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  toolValueTypeList
} from '@fastgpt/global/core/workflow/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';

const defaultInput: FlowNodeInputItemType = {
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  valueType: WorkflowIOValueTypeEnum.any,
  canEdit: true,
  key: '',
  label: ''
};

const DynamicInputs = (props: RenderInputProps) => {
  const { item, inputs = [], nodeId } = props;
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const dynamicInputs = useMemo(() => inputs.filter((item) => item.canEdit), [inputs]);
  const keys = useMemo(() => {
    return inputs.map((input) => input.key);
  }, [inputs]);

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
        </HStack>
        {/* field render */}
        <Box mt={2}>
          {[...dynamicInputs, {} as FlowNodeInputItemType].map((children, index) => (
            <Box key={children.key || `empty-${index}`} _notLast={{ mb: 3 }}>
              <Reference {...props} inputChildren={children} isEmptyItem={!children.key} />
            </Box>
          ))}
        </Box>
      </Box>
    );
  }, [dynamicInputs, item, keys, onAddField, props, t]);

  return Render;
};

export default React.memo(DynamicInputs);

const Reference = ({
  inputChildren,
  isEmptyItem = false,
  ...props
}: RenderInputProps & {
  inputChildren: FlowNodeInputItemType;
  isEmptyItem?: boolean;
}) => {
  const { nodeId, inputs = [], item } = props;
  const { t } = useTranslation();
  const { toast } = useToast();

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const keys = useMemo(() => {
    return inputs.map((input) => input.key);
  }, [inputs]);

  const [tempLabel, setTempLabel] = useState('');

  const { referenceList } = useReference({
    nodeId,
    valueType: inputChildren.valueType || WorkflowIOValueTypeEnum.any
  });

  const onSelect = useCallback(
    (e?: ReferenceValueType) => {
      if (!e || isEmptyItem) return;

      const referenceItem = referenceList
        .find((item) => item.value === e[0])
        ?.children.find((item) => item.value === e[1]);

      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: {
          ...inputChildren,
          value: e,
          valueType: referenceItem?.valueType || WorkflowIOValueTypeEnum.any
        }
      });
    },
    [inputChildren, nodeId, onChangeNode, isEmptyItem, referenceList]
  );

  const onDel = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'delInput',
      key: inputChildren.key
    });
  }, [inputChildren.key, nodeId, onChangeNode]);

  const handleLabelChange = useCallback(
    (newLabel: string) => {
      if (isEmptyItem) {
        setTempLabel(newLabel);
        return;
      }
      setTempLabel(newLabel);
    },
    [isEmptyItem]
  );

  const handleLabelBlur = useCallback(
    (finalLabel: string) => {
      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: {
          ...inputChildren,
          label: finalLabel,
          key: finalLabel || inputChildren.key
        }
      });
      setTempLabel('');
    },
    [inputChildren, nodeId, onChangeNode, isEmptyItem]
  );

  const handleCreateNewInput = useCallback(
    (label: string) => {
      if (!label.trim()) return;

      if (keys.includes(label)) {
        toast({
          status: 'warning',
          title: t('app:variable_repeat')
        });
        return;
      }

      const newInput: FlowNodeInputItemType = {
        ...defaultInput,
        ...getInputComponentProps(item),
        key: label,
        label: label,
        valueType: WorkflowIOValueTypeEnum.any,
        required: true
      };

      onChangeNode({
        nodeId,
        type: 'addInput',
        value: newInput
      });

      setTempLabel('');
    },
    [keys, toast, t, item, onChangeNode, nodeId]
  );

  const handleValueTypeChange = useCallback(
    (newValueType: string) => {
      if (isEmptyItem) {
        return;
      }

      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: inputChildren.key,
        value: {
          ...inputChildren,
          valueType: newValueType as WorkflowIOValueTypeEnum
        }
      });
    },
    [inputChildren, nodeId, onChangeNode, isEmptyItem]
  );

  return (
    <Flex alignItems={'center'} mb={1} gap={2}>
      <Flex flex={'1'}>
        <Input
          placeholder={t('workflow:Variable_name')}
          value={isEmptyItem ? tempLabel : tempLabel || inputChildren.label || ''}
          onChange={(e) => handleLabelChange(e.target.value)}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (isEmptyItem && value) {
              handleCreateNewInput(value);
            } else if (!isEmptyItem) {
              handleLabelBlur(value);
            }
          }}
          h={10}
          borderRightRadius={'none'}
        />
        <ReferSelector
          placeholder={t('common:select_reference_variable')}
          list={referenceList}
          value={inputChildren.value}
          onSelect={onSelect}
          ButtonProps={{
            bg: 'none',
            borderRadius: 'none',
            borderColor: 'myGray.200'
          }}
        />
        <MySelect
          h={10}
          borderLeftRadius={'none'}
          borderColor={'myGray.200'}
          minW={'140px'}
          value={inputChildren.valueType || WorkflowIOValueTypeEnum.any}
          list={Object.values(WorkflowIOValueTypeEnum)
            .filter((type) => type !== WorkflowIOValueTypeEnum.selectApp)
            .map((item) => ({
              label: item,
              value: item
            }))}
          onChange={(value) => handleValueTypeChange(value)}
          bg={'myGray.50'}
          isDisabled={!inputChildren.key}
        />
      </Flex>
      {!isEmptyItem && (
        <Box w={6}>
          <MyIconButton
            icon="delete"
            color={'myGray.600'}
            hoverBg="red.50"
            hoverColor="red.600"
            size={'14px'}
            onClick={onDel}
          />
        </Box>
      )}
      {isEmptyItem && <Box w={6} />}
    </Flex>
  );
};
