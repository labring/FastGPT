import React, { useCallback, useMemo } from 'react';
import NodeCard from '../render/NodeCard';
import { type NodeProps } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex } from '@chakra-ui/react';
import { type TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import Container from '../../components/Container';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SmallAddIcon } from '@chakra-ui/icons';
import type {
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { getRefData } from '@/web/core/workflow/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import { getEditorVariables } from '../../../utils';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  valueTypeToInputType,
  variableInputTypeToInputType
} from '@/components/core/app/formRender/utils';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useMemoizedFn } from 'ahooks';
import ValueTypeLabel from '../render/ValueTypeLabel';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import VariableSelector from './VariableSelector';
import ValueRenderer from './ValueRenderer';

// 切换目标变量时按新类型生成默认操作字段与初值，
// 保证 UI 初始显示与 runtime 默认行为一致（否则 boolean 会出现 UI 显示"是" / runtime 写 false 的错配）
const getDefaultsForValueType = (valueType?: WorkflowIOValueTypeEnum): Partial<TUpdateListItem> => {
  const isArray = typeof valueType === 'string' && valueType.startsWith('array');
  return {
    valueType,
    numberOperator: valueType === WorkflowIOValueTypeEnum.number ? '=' : undefined,
    booleanMode: valueType === WorkflowIOValueTypeEnum.boolean ? 'true' : undefined,
    arrayMode: isArray ? 'equal' : undefined,
    value:
      valueType === WorkflowIOValueTypeEnum.boolean
        ? (['', true] as unknown as ReferenceValueType)
        : (['', ''] as ReferenceValueType)
  };
};

const NodeVariableUpdate = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs = [], nodeId } = data;
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { edges, getNodeById, systemConfigNode } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const variables = useMemoEnhance(() => {
    return getEditorVariables({
      nodeId,
      systemConfigNode,
      getNodeById,
      edges,
      appDetail,
      t
    });
  }, [nodeId, systemConfigNode, getNodeById, edges, appDetail, t]);
  const { feConfigs } = useSystemStore();
  const externalProviderWorkflowVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  const updateList = useMemo(
    () =>
      (inputs.find((input) => input.key === NodeInputKeyEnum.updateList)
        ?.value as TUpdateListItem[]) || [],
    [inputs]
  );

  const onUpdateList = useCallback(
    (value: TUpdateListItem[]) => {
      const updateListInput = inputs.find((input) => input.key === NodeInputKeyEnum.updateList);
      if (!updateListInput) return;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.updateList,
        value: {
          ...updateListInput,
          value
        }
      });
    },
    [inputs, nodeId, onChangeNode]
  );

  const ValueRow = useMemoizedFn(
    ({ updateItem, index }: { updateItem: TUpdateListItem; index: number }) => {
      // 根据目标变量推断 string 分支的 inputType 与表单参数（select options 等）
      const { inputType, formParams = {} } = (() => {
        const value = updateItem.variable;
        if (!value) {
          return { inputType: InputTypeEnum.input };
        }
        if (value[0] === VARIABLE_NODE_ID) {
          const variableList = appDetail.chatConfig.variables || [];
          const variable = variableList.find((item) => item.key === value[1]);
          if (variable) {
            // 文件类型在变量更新节点中使用文本框（无运行时上下文）
            const it =
              variable.type === VariableInputEnum.file
                ? InputTypeEnum.textarea
                : variableInputTypeToInputType(variable.type, variable.valueType);
            return {
              inputType: it,
              formParams: {
                maxLength: variable.maxLength,
                minLength: variable.minLength,
                min: variable.min,
                max: variable.max,
                list: variable.list,
                timeGranularity: variable.timeGranularity,
                timeRangeStart: variable.timeRangeStart,
                timeRangeEnd: variable.timeRangeEnd,
                maxFiles: variable.maxFiles,
                canSelectFile: variable.canSelectFile,
                canSelectImg: variable.canSelectImg,
                canSelectVideo: variable.canSelectVideo,
                canSelectAudio: variable.canSelectAudio,
                canSelectCustomFileExtension: variable.canSelectCustomFileExtension,
                customFileExtensionList: variable.customFileExtensionList
              }
            };
          }
        } else if (value[0] && value[1]) {
          const output = getNodeById(value[0])?.outputs.find((o) => o.id === value[1]);
          if (output) return { inputType: valueTypeToInputType(output.valueType) };
        }
        return { inputType: InputTypeEnum.input };
      })();

      const { valueType } = getRefData({
        variable: updateItem.variable,
        getNodeById,
        systemConfigNode,
        chatConfig: appDetail.chatConfig
      });

      const applyPatch = (patch: Partial<TUpdateListItem>) => {
        onUpdateList(
          updateList.map((update, i) => (i === index ? { ...update, ...patch } : update))
        );
      };

      return (
        <Container key={index} w={'full'} mx={0} pt={4}>
          {/* 目标变量 */}
          <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
            <Flex alignItems={'center'} position={'relative'} fontWeight={'medium'}>
              <FormLabel required color={'myGray.600'}>
                {t('common:core.workflow.variable')}
              </FormLabel>
            </Flex>
          </Flex>

          <Flex mt={2} alignItems={'center'} w="full">
            <Box flex={1} w={0}>
              <VariableSelector
                nodeId={nodeId}
                variable={updateItem.variable}
                onSelect={(value) => {
                  const newValueType = getRefData({
                    variable: value as ReferenceItemValueType,
                    getNodeById,
                    systemConfigNode,
                    chatConfig: appDetail.chatConfig
                  }).valueType;
                  applyPatch({
                    variable: value as ReferenceItemValueType,
                    ...getDefaultsForValueType(newValueType)
                  });
                }}
              />
            </Box>
            <ValueTypeLabel valueType={valueType} />
          </Flex>

          {/* 值 */}
          <Flex mt={4} className="nodrag" cursor={'default'} alignItems={'center'}>
            <FormLabel required color={'myGray.600'}>
              {t('common:value')}
            </FormLabel>
            <Box ml={2}>
              <NodeInputSelect
                renderTypeList={[inputType, FlowNodeInputTypeEnum.reference]}
                renderTypeIndex={updateItem.renderType === FlowNodeInputTypeEnum.reference ? 1 : 0}
                onChange={(e) => {
                  const nt =
                    e === FlowNodeInputTypeEnum.reference
                      ? FlowNodeInputTypeEnum.reference
                      : FlowNodeInputTypeEnum.input;
                  applyPatch({ renderType: nt, value: undefined });
                }}
              />
            </Box>
          </Flex>

          <Box mt={2} w={'full'} className="nodrag">
            <ValueRenderer
              nodeId={nodeId}
              valueType={valueType}
              stringInputType={inputType}
              stringFormParams={formParams}
              value={updateItem.value}
              renderType={updateItem.renderType}
              numberOperator={updateItem.numberOperator}
              booleanMode={updateItem.booleanMode}
              arrayMode={updateItem.arrayMode}
              variables={[...variables, ...externalProviderWorkflowVariables]}
              variableLabels={variables}
              onChange={applyPatch}
            />
          </Box>

          {updateList.length > 1 && (
            <MyIcon
              className="delete"
              name={'delete'}
              w={'14px'}
              color={'myGray.600'}
              cursor={'pointer'}
              _hover={{ color: 'red.500' }}
              position={'absolute'}
              top={3}
              right={3}
              onClick={() => onUpdateList(updateList.filter((_, i) => i !== index))}
            />
          )}
        </Container>
      );
    }
  );

  const Render = useMemo(() => {
    return (
      <NodeCard selected={selected} minW={'522px'} maxW={'1000px'} {...data}>
        <Box px={4} pb={4}>
          <Flex flexDirection={'column'} gap={4}>
            {updateList.map((updateItem, index) => (
              <ValueRow key={index} updateItem={updateItem} index={index} />
            ))}
          </Flex>
          <Flex className="nodrag" alignItems={'center'} mt={4}>
            <Button
              variant={'whiteBase'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              w={'full'}
              size={'sm'}
              onClick={() => {
                onUpdateList([
                  ...updateList,
                  {
                    variable: ['', ''],
                    value: ['', ''],
                    renderType: FlowNodeInputTypeEnum.input
                  }
                ]);
              }}
            >
              {t('common:add_new')}
            </Button>
          </Flex>
        </Box>
      </NodeCard>
    );
  }, [ValueRow, data, onUpdateList, selected, t, updateList]);

  return Render;
};

export default React.memo(NodeVariableUpdate);
