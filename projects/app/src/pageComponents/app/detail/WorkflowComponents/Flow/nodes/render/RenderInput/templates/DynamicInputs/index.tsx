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
import { getInputComponentProps } from '@/web/core/workflow/utils';
import { ReferSelector, useReference } from '../Reference';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  FlowNodeInputTypeEnum,
  FlowValueTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';

const defaultInput: FlowNodeInputItemType = {
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  valueType: WorkflowIOValueTypeEnum.any,
  canEdit: true,
  key: '',
  label: ''
};

const DynamicInputs = ({ item, inputs = [], nodeId }: RenderInputProps) => {
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const dynamicInputs = useMemoEnhance(() => inputs.filter((item) => item.canEdit), [inputs]);
  const existsKeys = useMemoEnhance(() => inputs.map((item) => item.key), [inputs]);

  return (
    <Box borderBottom={'base'} pb={3}>
      <HStack className="nodrag" cursor={'default'} position={'relative'}>
        <HStack spacing={1} position={'relative'} fontWeight={'medium'} color={'myGray.600'}>
          <Box>{item.label || t('workflow:custom_input')}</Box>
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
                    onChangeNode({
                      nodeId,
                      type: 'delInput',
                      key: item.key
                    });
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
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const isEmptyItem = !inputChildren.key;

  const [tempLabel, setTempLabel] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const { referenceList } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any
  });

  const onlBlurLabel = useCallback(
    (label: string) => {
      setIsEditing(false);
      if (!label.trim()) return;
      if (existsKeys.includes(label) && !isEmptyItem && label !== inputChildren.key) {
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
      }, 50);
      setTempLabel('');
    },
    [existsKeys, toast, t, isEmptyItem, item, onChangeNode, nodeId, inputChildren]
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
    [inputChildren, nodeId, onChangeNode, referenceList]
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
          {t(FlowValueTypeMap[inputChildren.valueType || WorkflowIOValueTypeEnum.any].label)}
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
