import React, { useCallback, useState } from 'react';
import type { RenderInputProps } from '../../type';
import { Box, Flex, HStack, Input } from '@chakra-ui/react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import {
  type FlowNodeInputItemType,
  type ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { getInputComponentProps } from '@/web/core/workflow/utils';
import { ReferSelector, useLazyReferenceList } from '../Reference';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  FlowNodeInputTypeEnum,
  getFlowValueTypeMeta
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useField, useNodeActions } from '@/web/core/workflow/editor';

const defaultInput: FlowNodeInputItemType = {
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  selectedType: FlowNodeInputTypeEnum.reference,
  valueType: WorkflowIOValueTypeEnum.any,
  canEdit: true,
  key: '',
  label: ''
};

/**
 * 自定义输入（动态输入）模板：整块字段的增删改都是记录级变更，
 * 统一读文档当前 inputs、拼完整数组后走 updateNode，一次交互只产生一条历史。
 */
const DynamicInputs = ({ item, inputs = [], nodeId }: RenderInputProps) => {
  const { t } = useSafeTranslation();
  const nodeActions = useNodeActions(nodeId);

  const dynamicInputs = useMemoEnhance(() => inputs.filter((item) => item.canEdit), [inputs]);
  const existsKeys = useMemoEnhance(() => inputs.map((item) => item.key), [inputs]);

  const hideBottomDivider = item.customInputConfig?.hideBottomDivider;

  return (
    <Box borderBottom={hideBottomDivider ? undefined : 'base'} pb={hideBottomDivider ? 0 : 3}>
      <HStack className="nodrag" cursor={'default'} position={'relative'}>
        <HStack spacing={1} position={'relative'} fontWeight={'medium'} color={'myGray.600'}>
          <Box>{item.label ? t(item.label as any) : t('workflow:custom_input')}</Box>
          {item.description && <QuestionTip label={t(item.description as any)} />}

          {item.deprecated && (
            <>
              <Box flex={'1'} />
              <MyTooltip label={t('app:Click_to_delete_this_field')}>
                <Flex
                  px={1.5}
                  py={1}
                  bg={'adora.50'}
                  rounded={'6px'}
                  fontSize={'14px'}
                  cursor="pointer"
                  alignItems={'center'}
                  _hover={{
                    bg: 'adora.100'
                  }}
                  onClick={() => {
                    nodeActions?.updateNode((current) => ({
                      inputs: current.inputs.filter((input) => input.key !== item.key)
                    }));
                  }}
                >
                  <MyIcon name={'common/info'} color={'adora.600'} w={4} mr={1} />
                  <Box color={'adora.600'}>{t('app:Filed_is_deprecated')}</Box>
                </Flex>
              </MyTooltip>
            </>
          )}
        </HStack>
      </HStack>
      {/* field render */}
      <Box mt={2}>
        <Flex alignItems={'center'} mb={2} gap={2} px={1}>
          <Flex flex={'1'}>
            <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'medium'} flex={1} px={3}>
              {t('workflow:Variable_name')}
            </Box>
            <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'medium'} minW={'240px'} px={3}>
              {t('app:reference_variable')}
            </Box>
            <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'medium'} minW={'140px'} px={3}>
              {t('common:core.module.Data Type')}
            </Box>
          </Flex>
          {dynamicInputs.length > 0 && <Box w={6} />}
        </Flex>
        {[...dynamicInputs, defaultInput].map((children) => (
          <Box key={children.key} _notLast={{ mb: 1.5 }}>
            <Reference
              nodeId={nodeId}
              existsKeys={existsKeys}
              item={item}
              inputChildren={children}
              hasDynamicInputs={dynamicInputs.length > 0}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default React.memo(DynamicInputs);

const Reference = ({
  inputChildren,
  nodeId,
  existsKeys,
  item,
  hasDynamicInputs
}: {
  nodeId: string;
  item: FlowNodeInputItemType;
  existsKeys: string[];
  inputChildren: FlowNodeInputItemType;
  hasDynamicInputs: boolean;
}) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const nodeActions = useNodeActions(nodeId);
  // 已选内容的展示读字段引用状态，因此可选列表可以等到打开选择器时再计算。
  const field = useField(nodeId, inputChildren.key, 'input');
  const currentInput = (field?.data.input ?? inputChildren) as FlowNodeInputItemType;

  const isEmptyItem = !currentInput.key;

  const [tempLabel, setTempLabel] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const { referenceList, loadReferenceList } = useLazyReferenceList({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any,
    // Container nodes (loopRun) need to reference outputs from their sub-workflow.
    includeChildren: true
  });

  const onlBlurLabel = useCallback(
    (label: string) => {
      setIsEditing(false);
      if (!label.trim()) return;
      if (existsKeys.includes(label) && !isEmptyItem && label !== currentInput.key) {
        toast({
          status: 'warning',
          title: t('workflow:field_name_already_exists')
        });
        return;
      }

      setTimeout(() => {
        if (isEmptyItem && label) {
          const newInput: FlowNodeInputItemType = {
            ...defaultInput,
            ...getInputComponentProps(item),
            key: label,
            label: label,
            valueType: WorkflowIOValueTypeEnum.any,
            required: true
          };
          nodeActions?.updateNode((current) => ({ inputs: [...current.inputs, newInput] }));
        } else if (!isEmptyItem) {
          nodeActions?.updateNode((current) => ({
            inputs: current.inputs.map((input) =>
              input.key === currentInput.key ? { ...input, label, key: label || input.key } : input
            )
          }));
        }
      }, 50);
      setTempLabel('');
    },
    [currentInput.key, existsKeys, toast, t, isEmptyItem, item, nodeActions]
  );
  const onSelectReference = useCallback(
    (e?: ReferenceValueType) => {
      if (!e) return;

      const referenceItem = referenceList
        .find((item) => item.value === e[0])
        ?.children.find((item) => item.value === e[1]);

      nodeActions?.updateNode((current) => ({
        inputs: current.inputs.map((input) =>
          input.key === currentInput.key
            ? {
                ...input,
                value: e,
                // 目标类型解析不到时保留原类型，不要静默降级成 any
                valueType: referenceItem?.valueType ?? input.valueType
              }
            : input
        )
      }));
    },
    [currentInput.key, nodeActions, referenceList]
  );
  const onDeleteInput = useCallback(() => {
    nodeActions?.updateNode((current) => ({
      inputs: current.inputs.filter((input) => input.key !== currentInput.key)
    }));
  }, [currentInput.key, nodeActions]);

  return (
    <Flex alignItems={'center'} mb={1} gap={2}>
      <Flex flex={'1'} bg={'white'} rounded={'md'}>
        <Input
          placeholder={t('workflow:Variable_name')}
          value={isEditing ? tempLabel : currentInput.label || ''}
          onFocus={() => {
            setTempLabel(currentInput.label || '');
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
          value={currentInput.value}
          onSelect={onSelectReference}
          onOpenList={loadReferenceList}
          reference={field?.reference}
          ButtonProps={{
            bg: 'none',
            borderRadius: 'none',
            borderColor: 'myGray.200',
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            isDisabled: isEmptyItem,
            w: '240px',
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
          minW={'150px'}
          alignItems={'center'}
          pl={4}
          opacity={isEmptyItem ? 0.5 : 1}
          fontSize={'sm'}
          fontWeight={'medium'}
        >
          {t(getFlowValueTypeMeta(currentInput.valueType).label)}
        </Flex>
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
      {isEmptyItem && hasDynamicInputs && <Box w={6} />}
    </Flex>
  );
};
