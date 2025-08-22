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
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
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
          {[...dynamicInputs, defaultInput].map((children) => (
            <Box key={children.key} _notLast={{ mb: 3 }}>
              <Reference {...props} inputChildren={children} />
            </Box>
          ))}
        </Box>
      </Box>
    );
  }, [dynamicInputs, item, onAddField, props, t]);

  return Render;
};

export default React.memo(DynamicInputs);

const Reference = ({
  inputChildren,
  ...props
}: RenderInputProps & {
  inputChildren: FlowNodeInputItemType;
}) => {
  const { nodeId, inputs, item } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const isEmptyItem = !inputChildren.key;

  const [tempLabel, setTempLabel] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const { referenceList } = useReference({
    nodeId,
    valueType: inputChildren.valueType || WorkflowIOValueTypeEnum.any
  });
  const valueTypeList = useMemo(() => {
    return Object.values(WorkflowIOValueTypeEnum)
      .filter((type) => type !== WorkflowIOValueTypeEnum.selectApp)
      .map((item) => ({
        label: item,
        value: item
      }));
  }, []);

  const onlBlurLabel = useCallback(
    (label: string) => {
      setIsEditing(false);
      if (!label.trim()) return;
      if (inputs?.find((input) => input.key === label)) return;
      if (isEmptyItem && label) {
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
      } else if (!isEmptyItem) {
        onChangeNode({
          nodeId,
          type: 'replaceInput',
          key: inputChildren.key,
          value: {
            ...inputChildren,
            label: label,
            key: label || inputChildren.key
          }
        });
      }
      setTempLabel('');
    },
    [inputChildren, nodeId, onChangeNode, isEmptyItem, toast, t, item]
  );
  const onSelectReference = useCallback(
    (e?: ReferenceValueType) => {
      if (!e) return;

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
  const onlChangeValueType = useCallback(
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
  const onDeleteInput = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'delInput',
      key: inputChildren.key
    });
  }, [inputChildren.key, nodeId, onChangeNode]);

  return (
    <Flex alignItems={'center'} mb={1} gap={2}>
      <Flex flex={'1'} bg={'white'} rounded={'md'}>
        <Input
          placeholder={t('workflow:Variable_name')}
          value={isEditing ? tempLabel : inputChildren.label || ''}
          onFocus={() => {
            setTempLabel(inputChildren.label || '');
            setIsEditing(true);
          }}
          onChange={(e) => setTempLabel(e.target.value.trim())}
          onBlur={(e) => onlBlurLabel(e.target.value.trim())}
          h={10}
          borderRightRadius={'none'}
        />
        <ReferSelector
          placeholder={t('common:select_reference_variable')}
          list={referenceList}
          value={inputChildren.value}
          onSelect={onSelectReference}
          ButtonProps={{
            bg: 'none',
            borderRadius: 'none',
            borderColor: 'myGray.200',
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            isDisabled: isEmptyItem,
            minW: '240px',
            _hover: {
              borderColor: 'blue.300'
            }
          }}
        />
        <MySelect
          h={10}
          borderLeftRadius={'none'}
          borderColor={'myGray.200'}
          minW={'140px'}
          value={inputChildren.valueType || WorkflowIOValueTypeEnum.any}
          list={valueTypeList}
          onChange={(value) => onlChangeValueType(value)}
          isDisabled={isEmptyItem}
        />
      </Flex>
      {!isEmptyItem && (
        <Box w={6}>
          <MyIconButton
            icon={'delete'}
            color={'myGray.600'}
            hoverBg={'red.50'}
            hoverColor={'red.600'}
            size={'14px'}
            onClick={onDeleteInput}
          />
        </Box>
      )}
      {isEmptyItem && <Box w={6} />}
    </Flex>
  );
};
