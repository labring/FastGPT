import React, { useMemo, useState, useCallback } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import { Box, Flex, Input, HStack } from '@chakra-ui/react';
import {
  FlowNodeOutputTypeEnum,
  getFlowValueTypeMeta
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
import { ReferSelector, useReference } from '../RenderInput/templates/Reference';
import { useToast } from '@fastgpt/web/hooks/useToast';

type DynamicOutputsProps = {
  nodeId: string;
  outputs: FlowNodeOutputItemType[];
  addOutput: FlowNodeOutputItemType;
  /** 与代码节点「自定义输入」一致：变量名 + 引用 + 类型；仅列出该父节点子画布内节点 */
  referenceScopeParentId?: string;
};

/** Loop Pro 自定义输出表格行宽；与 NodeLoop 标题行宽度一致，便于「报错捕获」与表格右缘对齐 */
export const LOOP_PRO_DYNAMIC_OUTPUT_ROW_W = '420px';
const LOOP_PRO_COL_VAR_W = '80px';
const LOOP_PRO_COL_REF_W = '196px';
const LOOP_PRO_COL_TYPE_W = '112px';

const defaultOutput: FlowNodeOutputItemType = {
  id: '',
  type: FlowNodeOutputTypeEnum.dynamic,
  key: '',
  label: '',
  valueType: WorkflowIOValueTypeEnum.any,
  valueDesc: '',
  description: ''
};

const DynamicOutputs = ({
  nodeId,
  outputs,
  addOutput,
  referenceScopeParentId
}: DynamicOutputsProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

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
            <Box>{addOutput.label || t('common:core.workflow.Custom outputs')}</Box>
            {addOutput.description && <QuestionTip label={addOutput.description} />}
          </HStack>
        </HStack>
        <Box mt={2}>
          <Flex
            alignItems={'center'}
            mb={2}
            gap={2}
            px={1}
            w={referenceScopeParentId ? LOOP_PRO_DYNAMIC_OUTPUT_ROW_W : undefined}
            maxW={referenceScopeParentId ? LOOP_PRO_DYNAMIC_OUTPUT_ROW_W : undefined}
          >
            <Flex
              flex={referenceScopeParentId ? 'none' : '1'}
              w={referenceScopeParentId ? '388px' : undefined}
            >
              <Box
                fontSize={'sm'}
                color={'myGray.500'}
                fontWeight={'medium'}
                flex={referenceScopeParentId ? 'none' : 1}
                w={referenceScopeParentId ? LOOP_PRO_COL_VAR_W : undefined}
                px={3}
              >
                {t('workflow:Variable_name')}
              </Box>
              {referenceScopeParentId ? (
                <>
                  <Box
                    fontSize={'sm'}
                    color={'myGray.500'}
                    fontWeight={'medium'}
                    w={LOOP_PRO_COL_REF_W}
                    flexShrink={0}
                    px={3}
                  >
                    {t('app:reference_variable')}
                  </Box>
                  <Box
                    fontSize={'sm'}
                    color={'myGray.500'}
                    fontWeight={'medium'}
                    w={LOOP_PRO_COL_TYPE_W}
                    flexShrink={0}
                    px={3}
                  >
                    {t('common:core.module.Data Type')}
                  </Box>
                </>
              ) : (
                <Box
                  fontSize={'sm'}
                  color={'myGray.500'}
                  fontWeight={'medium'}
                  minW={'240px'}
                  px={3}
                >
                  {t('common:core.module.Data Type')}
                </Box>
              )}
            </Flex>
            {outputs.length > 0 && <Box w={6} flexShrink={0} />}
          </Flex>
          {[...outputs, defaultOutput].map((output, rowIndex) => (
            <Box key={output.key || `empty-row-${rowIndex}`} _notLast={{ mb: 1.5 }}>
              {referenceScopeParentId ? (
                <DynamicOutputItemWithReference
                  output={output}
                  outputs={outputs}
                  nodeId={nodeId}
                  referenceScopeParentId={referenceScopeParentId}
                  onUpdate={handleUpdateOutput}
                  onDelete={handleDeleteOutput}
                  onAdd={handleAddOutput}
                />
              ) : (
                <DynamicOutputItem
                  output={output}
                  outputs={outputs}
                  onUpdate={handleUpdateOutput}
                  onDelete={handleDeleteOutput}
                  onAdd={handleAddOutput}
                />
              )}
            </Box>
          ))}
        </Box>
      </Box>
    );
  }, [
    outputs,
    addOutput,
    handleUpdateOutput,
    handleDeleteOutput,
    handleAddOutput,
    t,
    referenceScopeParentId,
    nodeId
  ]);

  return Render;
};

export default React.memo(DynamicOutputs);

const DynamicOutputItemWithReference = ({
  output,
  outputs,
  nodeId,
  referenceScopeParentId,
  onUpdate,
  onDelete,
  onAdd
}: {
  output: FlowNodeOutputItemType;
  outputs: FlowNodeOutputItemType[];
  nodeId: string;
  referenceScopeParentId: string;
  onUpdate: (originalKey: string, output: FlowNodeOutputItemType) => void;
  onDelete: (key: string) => void;
  onAdd: (output: FlowNodeOutputItemType) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [tempLabel, setTempLabel] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const isEmptyItem = !output?.key;

  const { referenceList } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any,
    restrictToWorkflowParentId: referenceScopeParentId
  });

  const existsKeys = useMemo(() => outputs.map((o) => o.key), [outputs]);

  const onLabelBlur = useCallback(
    (label: string) => {
      setIsEditing(false);
      if (!label.trim()) return;
      if (existsKeys.includes(label) && (!isEmptyItem ? label !== output.key : true)) {
        toast({
          status: 'warning',
          title: t('workflow:field_name_already_exists')
        });
        return;
      }
      setTimeout(() => {
        if (isEmptyItem && label) {
          onAdd({
            ...defaultOutput,
            id: getNanoid(6),
            key: label,
            label,
            valueType: WorkflowIOValueTypeEnum.any,
            type: FlowNodeOutputTypeEnum.dynamic
          });
        } else if (!isEmptyItem) {
          onUpdate(output.key, {
            ...output,
            label,
            key: label || output.key
          });
        }
      }, 50);
      setTempLabel('');
    },
    [output, onUpdate, onAdd, isEmptyItem, existsKeys, toast, t]
  );

  const onSelectReference = useCallback(
    (e?: ReferenceValueType) => {
      if (!e || isEmptyItem) return;
      const referenceItem = referenceList
        .find((item) => item.value === e[0])
        ?.children.find((item) => item.value === e[1]);
      onUpdate(output.key, {
        ...output,
        value: e,
        valueType: referenceItem?.valueType || WorkflowIOValueTypeEnum.any
      });
    },
    [output, onUpdate, isEmptyItem, referenceList]
  );

  return (
    <Flex
      alignItems={'center'}
      mb={1}
      gap={2}
      w={LOOP_PRO_DYNAMIC_OUTPUT_ROW_W}
      maxW={LOOP_PRO_DYNAMIC_OUTPUT_ROW_W}
    >
      <Flex flex={'none'} w={'388px'} bg={'white'} rounded={'md'}>
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
          w={LOOP_PRO_COL_VAR_W}
          minW={LOOP_PRO_COL_VAR_W}
          maxW={LOOP_PRO_COL_VAR_W}
          flexShrink={0}
        />
        <ReferSelector
          placeholder={t('common:select_reference_variable')}
          list={referenceList}
          value={output.value as ReferenceValueType | undefined}
          onSelect={onSelectReference}
          ButtonProps={{
            bg: 'none',
            borderRadius: 'none',
            borderColor: 'myGray.200',
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            isDisabled: isEmptyItem,
            w: LOOP_PRO_COL_REF_W,
            minW: LOOP_PRO_COL_REF_W,
            maxW: LOOP_PRO_COL_REF_W,
            flexShrink: 0,
            _hover: {
              borderColor: 'blue.300'
            }
          }}
        />
        <Flex
          h={10}
          border={'1px solid'}
          borderRightRadius={'sm'}
          borderColor={'myGray.200'}
          w={LOOP_PRO_COL_TYPE_W}
          minW={LOOP_PRO_COL_TYPE_W}
          flexShrink={0}
          alignItems={'center'}
          pl={4}
          opacity={isEmptyItem ? 0.5 : 1}
          fontSize={'sm'}
          fontWeight={'medium'}
        >
          {t(getFlowValueTypeMeta(output.valueType || WorkflowIOValueTypeEnum.any).label)}
        </Flex>
      </Flex>
      {!isEmptyItem && (
        <Box w={6} flexShrink={0}>
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
      {isEmptyItem && outputs.length > 0 && <Box w={6} flexShrink={0} />}
    </Flex>
  );
};

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
