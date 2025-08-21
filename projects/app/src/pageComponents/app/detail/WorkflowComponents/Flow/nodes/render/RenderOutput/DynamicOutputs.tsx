import React, { useMemo, useState, useCallback } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { Box, Flex, Input, HStack } from '@chakra-ui/react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MySelect from '@fastgpt/web/components/common/MySelect';

type DynamicOutputsProps = {
  nodeId: string;
  outputs: FlowNodeOutputItemType[];
  title?: string;
  description?: string;
};

const defaultOutput: FlowNodeOutputItemType = {
  id: '',
  type: FlowNodeOutputTypeEnum.dynamic,
  key: '',
  label: '',
  valueType: WorkflowIOValueTypeEnum.any,
  valueDesc: '',
  description: ''
};

const DynamicOutputs = ({ nodeId, outputs, title, description }: DynamicOutputsProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const handleUpdateOutput = useCallback(
    (originalKey: string, updatedOutput: FlowNodeOutputItemType) => {
      onChangeNode({
        nodeId,
        type: 'replaceOutput',
        key: originalKey,
        value: updatedOutput
      });
    },
    [nodeId, onChangeNode]
  );

  const handleDeleteOutput = useCallback(
    (key: string) => {
      onChangeNode({
        nodeId,
        type: 'delOutput',
        key
      });
    },
    [nodeId, onChangeNode]
  );

  const handleAddOutput = useCallback(
    (newOutput: FlowNodeOutputItemType) => {
      onChangeNode({
        nodeId,
        type: 'addOutput',
        value: newOutput
      });
    },
    [nodeId, onChangeNode]
  );

  const Render = useMemo(() => {
    return (
      <Box pb={3}>
        <HStack className="nodrag" cursor={'default'} position={'relative'}>
          <HStack spacing={1} position={'relative'} fontWeight={'medium'} color={'myGray.600'}>
            <Box>{title || t('common:core.workflow.Custom outputs')}</Box>
            {description && <QuestionTip label={description} />}
          </HStack>
        </HStack>
        {/* field render */}
        <Box mt={2}>
          {[...outputs, defaultOutput].map((output, index) => (
            <Box key={output.key} _notLast={{ mb: 3 }}>
              <DynamicOutputItem
                output={output}
                outputs={outputs}
                onUpdate={handleUpdateOutput}
                onDelete={handleDeleteOutput}
                onAdd={handleAddOutput}
              />
            </Box>
          ))}
        </Box>
      </Box>
    );
  }, [
    outputs,
    title,
    description,
    nodeId,
    handleUpdateOutput,
    handleDeleteOutput,
    handleAddOutput,
    t
  ]);

  return Render;
};

export default React.memo(DynamicOutputs);

const DynamicOutputItem = ({
  output,
  outputs,
  onUpdate,
  onDelete,
  onAdd
}: {
  output: FlowNodeOutputItemType;
  outputs: FlowNodeOutputItemType[];
  onUpdate: (originalKey: string, output: FlowNodeOutputItemType) => void;
  onDelete: (key: string) => void;
  onAdd: (output: FlowNodeOutputItemType) => void;
}) => {
  const { t } = useTranslation();
  const [tempLabel, setTempLabel] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const isEmptyItem = !output?.key;
  const valueTypeList = useMemo(() => {
    return Object.values(WorkflowIOValueTypeEnum)
      .filter((type) => type !== WorkflowIOValueTypeEnum.selectApp)
      .map((item) => ({
        label: item,
        value: item
      }));
  }, []);

  const onChangeValueType = useCallback(
    (valueType: WorkflowIOValueTypeEnum) => {
      onUpdate(output.key, {
        ...output,
        valueType
      });
    },
    [output, onUpdate]
  );

  const onLabelBlur = useCallback(
    (label: string) => {
      setIsEditing(false);
      if (!label.trim()) return;
      if (outputs.find((output) => output.key === label)) return;
      if (isEmptyItem && label) {
        onAdd({
          ...defaultOutput,
          key: label,
          label: label,
          valueType: WorkflowIOValueTypeEnum.any,
          type: FlowNodeOutputTypeEnum.dynamic
        });
      } else if (!isEmptyItem) {
        onUpdate(output.key, {
          ...output,
          label,
          key: label
        });
      }
      setTempLabel('');
    },
    [output, onUpdate, onAdd, isEmptyItem, outputs]
  );

  return (
    <Flex alignItems={'center'} mb={1} gap={2}>
      <Flex flex={'1'} minW={0}>
        <Input
          placeholder={t('workflow:Variable_name')}
          value={isEditing ? tempLabel : output?.label || ''}
          onFocus={() => {
            setTempLabel(output?.label || '');
            setIsEditing(true);
          }}
          onChange={(e) => setTempLabel(e.target.value.trim())}
          onBlur={(e) => onLabelBlur(e.target.value.trim())}
          h={10}
          borderRightRadius={'none'}
          flex={1}
          minW={'120px'}
        />
        <MySelect
          h={10}
          borderLeftRadius={'none'}
          borderColor={'myGray.200'}
          minW={'140px'}
          value={output?.valueType}
          list={valueTypeList}
          onChange={onChangeValueType}
          bg={'myGray.50'}
          isDisabled={!output?.key}
          borderLeftColor={'transparent'}
          _hover={{
            borderColor: 'primary.300'
          }}
        />
      </Flex>
      {!isEmptyItem && (
        <Box minW={6}>
          <MyIconButton
            icon="delete"
            color={'myGray.600'}
            hoverBg="red.50"
            hoverColor="red.600"
            size={'14px'}
            onClick={() => onDelete(output.key)}
          />
        </Box>
      )}
      {isEmptyItem && <Box minW={6} />}
    </Flex>
  );
};
