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
import { defaultOutput } from './FieldEditModal';

interface DynamicOutputsProps {
  nodeId: string;
  outputs: FlowNodeOutputItemType[];
  addOutputConfig?: any;
  title?: string;
  description?: string;
}

const DynamicOutputs = ({
  nodeId,
  outputs,
  addOutputConfig,
  title,
  description
}: DynamicOutputsProps) => {
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
          {[...outputs, {} as FlowNodeOutputItemType].map((output, index) => (
            <Box key={output.key || `empty-${index}`} _notLast={{ mb: 3 }}>
              <DynamicOutputItem
                output={output}
                nodeId={nodeId}
                isEmptyItem={!output.key}
                onUpdate={handleUpdateOutput}
                onDelete={handleDeleteOutput}
                onAdd={handleAddOutput}
                addOutputConfig={addOutputConfig}
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
    addOutputConfig,
    t
  ]);

  return Render;
};

export default React.memo(DynamicOutputs);

// Dynamic Output Item Component
const DynamicOutputItem = ({
  output,
  nodeId,
  isEmptyItem = false,
  onUpdate,
  onDelete,
  onAdd,
  addOutputConfig
}: {
  output?: FlowNodeOutputItemType;
  nodeId: string;
  isEmptyItem?: boolean;
  onUpdate?: (originalKey: string, output: FlowNodeOutputItemType) => void;
  onDelete?: (key: string) => void;
  onAdd?: (output: FlowNodeOutputItemType) => void;
  addOutputConfig?: any;
}) => {
  const { t } = useTranslation();
  const [tempLabel, setTempLabel] = useState('');

  const handleValueTypeChange = useCallback(
    (newValueType: string) => {
      if (isEmptyItem) {
        return;
      }

      if (output && onUpdate) {
        onUpdate(output.key, {
          ...output,
          valueType: newValueType as WorkflowIOValueTypeEnum
        });
      }
    },
    [output, onUpdate, isEmptyItem]
  );

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
      if (output && onUpdate) {
        onUpdate(output.key, {
          ...output,
          label: finalLabel,
          key: finalLabel || output.key
        });
      }
      setTempLabel('');
    },
    [output, onUpdate, isEmptyItem]
  );

  const handleCreateNewOutput = useCallback(
    (label: string) => {
      if (!label.trim() || !onAdd) return;

      const newOutput: FlowNodeOutputItemType = {
        ...defaultOutput,
        key: label,
        label: label,
        valueType: WorkflowIOValueTypeEnum.any,
        type: FlowNodeOutputTypeEnum.dynamic
      };

      onAdd(newOutput);
      setTempLabel('');
    },
    [onAdd]
  );

  return (
    <Flex alignItems={'center'} mb={1} gap={2}>
      <Flex flex={'1'} minW={0}>
        <Input
          placeholder={t('workflow:Variable_name')}
          value={isEmptyItem ? tempLabel : tempLabel || output?.label || ''}
          onChange={(e) => handleLabelChange(e.target.value)}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (isEmptyItem && value) {
              handleCreateNewOutput(value);
            } else if (!isEmptyItem) {
              handleLabelBlur(value);
            }
          }}
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
          value={output?.valueType || WorkflowIOValueTypeEnum.any}
          list={addOutputConfig?.selectValueTypeList?.map((type: string) => ({
            label: type,
            value: type
          }))}
          onChange={(value) => handleValueTypeChange(value)}
          bg={'myGray.50'}
          isDisabled={!output?.key}
        />
      </Flex>
      {/* <Box
        padding={'3px 6px'}
        borderRadius={'6px'}
        border={'1.401px solid'}
        borderColor={'myGray.200'}
        backgroundColor={'myGray.100'}
        color={'myGray.500'}
        fontSize={'14px'}
        fontWeight={'500'}
      >
        {output?.valueType || WorkflowIOValueTypeEnum.any}
      </Box> */}
      {!isEmptyItem && (
        <Box minW={6}>
          <MyIconButton
            icon="delete"
            color={'myGray.600'}
            hoverBg="red.50"
            hoverColor="red.600"
            size={'14px'}
            onClick={() => output?.key && onDelete?.(output.key)}
          />
        </Box>
      )}
      {isEmptyItem && <Box minW={6} />}
    </Flex>
  );
};
