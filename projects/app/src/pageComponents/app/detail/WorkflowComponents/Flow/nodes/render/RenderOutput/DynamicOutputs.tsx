import React, { useMemo, useState, useCallback } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { Box, Flex, Input, HStack } from '@chakra-ui/react';
import {
  FlowNodeOutputTypeEnum,
  getFlowValueTypeMeta
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { getOutputDisconnectCommands } from '@/web/core/workflow/utils';

type DynamicOutputsProps = {
  nodeId: string;
  outputs: FlowNodeOutputItemType[];
  addOutput: FlowNodeOutputItemType;
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

const DynamicOutputs = ({ nodeId, outputs, addOutput }: DynamicOutputsProps) => {
  const { t } = useTranslation();
  const node = useNode(nodeId);
  // 边集合只在改/删输出字段的回调里读，走非订阅 getter：点击时取当前值，组件不订阅结构变更。
  const { getEdges } = useWorkflowActions();

  // 输出字段的增删改都是记录级变更：读文档当前 outputs、拼完整数组后走 updateNode。
  // 替换与删除会让旧 source handle 失效，连线必须同事务断开，否则撤销要按两下。
  const handleUpdateOutput = useCallback(
    (originalKey: string, updatedOutput: FlowNodeOutputItemType) => {
      node?.updateNode(
        (current) => ({
          outputs: current.outputs.map((item) => (item.key === originalKey ? updatedOutput : item))
        }),
        {
          disconnectEdges: getOutputDisconnectCommands({
            edges: getEdges(),
            nodeId,
            outputKey: originalKey
          })
        }
      );
    },
    [getEdges, node, nodeId]
  );

  const handleDeleteOutput = useCallback(
    (key: string) => {
      node?.updateNode(
        (current) => ({ outputs: current.outputs.filter((item) => item.key !== key) }),
        {
          disconnectEdges: getOutputDisconnectCommands({
            edges: getEdges(),
            nodeId,
            outputKey: key
          })
        }
      );
    },
    [getEdges, node, nodeId]
  );

  const handleAddOutput = useCallback(
    (newOutput: FlowNodeOutputItemType) => {
      node?.updateNode((current) => ({ outputs: [...current.outputs, newOutput] }));
    },
    [node]
  );

  const Render = useMemo(() => {
    return (
      <Box pb={3}>
        <HStack className="nodrag" cursor={'default'} position={'relative'}>
          <HStack spacing={1} position={'relative'} fontWeight={'medium'} color={'myGray.600'}>
            <Box>{addOutput.label || t('common:core.workflow.Custom outputs')}</Box>
            {addOutput.description && <QuestionTip label={addOutput.description} />}
          </HStack>
        </HStack>
        <Box mt={2}>
          <Flex alignItems={'center'} mb={2} gap={2} px={1}>
            <Flex flex={'1'}>
              <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'medium'} flex={1} px={3}>
                {t('workflow:Variable_name')}
              </Box>
              <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'medium'} minW={'240px'} px={3}>
                {t('common:core.module.Data Type')}
              </Box>
            </Flex>
            {outputs.length > 0 && <Box w={6} />}
          </Flex>
          {[...outputs, defaultOutput].map((output, index) => (
            <Box key={output.key || index} _notLast={{ mb: 1.5 }}>
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
  }, [outputs, addOutput, handleUpdateOutput, handleDeleteOutput, handleAddOutput, t]);

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
      .filter(
        (type) =>
          type !== WorkflowIOValueTypeEnum.selectApp && type !== WorkflowIOValueTypeEnum.dynamic
      )
      .map((item) => ({
        label: t(getFlowValueTypeMeta(item).label),
        value: item
      }));
  }, [t]);

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
      setTimeout(() => {
        if (isEmptyItem && label) {
          onAdd({
            ...defaultOutput,
            id: getNanoid(6),
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
      }, 50);
      setTempLabel('');
    },
    [output, onUpdate, onAdd, isEmptyItem, outputs]
  );

  const selectValueType = getFlowValueTypeMeta(output?.valueType).value;

  return (
    <Flex alignItems={'center'} mb={1} gap={2}>
      <Flex flex={'1'} bg={'white'} rounded={'md'}>
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
        />
        <MySelect
          h={10}
          borderLeftRadius={'none'}
          borderColor={'myGray.200'}
          value={selectValueType}
          list={valueTypeList}
          onChange={onChangeValueType}
          isDisabled={isEmptyItem}
          borderLeftColor={'transparent'}
          _hover={{
            borderColor: 'primary.300'
          }}
          minW={'240px'}
          className="nowheel"
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
            onClick={() => onDelete(output.key)}
          />
        </Box>
      )}
      {isEmptyItem && outputs.length > 0 && <Box w={6} />}
    </Flex>
  );
};
