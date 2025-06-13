import React, { useCallback, useMemo, useRef } from 'react';
import NodeCard from './render/NodeCard';
import { type NodeProps } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Switch
} from '@chakra-ui/react';
import { type TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import Container from '../components/Container';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SmallAddIcon } from '@chakra-ui/icons';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  type ReferenceItemValueType,
  type ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { ReferSelector, useReference } from './render/RenderInput/templates/Reference';
import { getRefData } from '@/web/core/workflow/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { useCreation, useMemoizedFn } from 'ahooks';
import { getEditorVariables } from '../../utils';
import { isArray } from 'lodash';
import { WorkflowNodeEdgeContext } from '../../context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';

const NodeVariableUpdate = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs = [], nodeId } = data;
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);

  const menuList = useRef([
    {
      renderType: FlowNodeInputTypeEnum.input,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.input].icon,
      label: t('common:core.workflow.inputType.Manual input')
    },
    {
      renderType: FlowNodeInputTypeEnum.reference,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.reference].icon,
      label: t('common:core.workflow.inputType.Reference')
    }
  ]);

  const variables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);
  const { feConfigs } = useSystemStore();
  const externalProviderWorkflowVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  // Node inputs
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

  const ValueRender = useMemoizedFn(
    ({ updateItem, index }: { updateItem: TUpdateListItem; index: number }) => {
      const { valueType } = getRefData({
        variable: updateItem.variable,
        nodeList,
        chatConfig: appDetail.chatConfig
      });
      const renderTypeData = menuList.current.find(
        (item) => item.renderType === updateItem.renderType
      );

      const onUpdateNewValue = (newValue?: ReferenceValueType | string) => {
        if (typeof newValue === 'string') {
          onUpdateList(
            updateList.map((update, i) =>
              i === index ? { ...update, value: ['', newValue] } : update
            )
          );
        } else if (newValue) {
          onUpdateList(
            updateList.map((update, i) =>
              i === index ? { ...update, value: newValue as ReferenceItemValueType } : update
            )
          );
        }
      };

      return (
        <Container key={index} w={'full'} mx={0}>
          <Flex alignItems={'center'}>
            <Flex w={'80px'}>{t('common:core.workflow.variable')}</Flex>
            <VariableSelector
              nodeId={nodeId}
              variable={updateItem.variable}
              onSelect={(value) => {
                onUpdateList(
                  updateList.map((update, i) => {
                    if (i === index) {
                      return {
                        ...update,
                        value: ['', ''],
                        valueType: getRefData({
                          variable: value as ReferenceItemValueType,
                          nodeList,
                          chatConfig: appDetail.chatConfig
                        }).valueType,
                        variable: value as ReferenceItemValueType
                      };
                    }
                    return update;
                  })
                );
              }}
            />
            <Box flex={1} />
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
                onClick={() => {
                  onUpdateList(updateList.filter((_, i) => i !== index));
                }}
              />
            )}
          </Flex>
          <Flex mt={2} w={'full'} alignItems={'center'} className="nodrag">
            <Flex w={'80px'}>
              <Box>{t('common:value')}</Box>
              <MyTooltip
                label={
                  menuList.current.find((item) => item.renderType === updateItem.renderType)?.label
                }
              >
                <Button
                  size={'xs'}
                  bg={'white'}
                  borderRadius={'xs'}
                  mx={2}
                  color={'primary.600'}
                  onClick={() => {
                    onUpdateList(
                      updateList.map((update, i) => {
                        if (i === index) {
                          return {
                            ...update,
                            value: undefined,
                            renderType:
                              updateItem.renderType === FlowNodeInputTypeEnum.input
                                ? FlowNodeInputTypeEnum.reference
                                : FlowNodeInputTypeEnum.input
                          };
                        }
                        return update;
                      })
                    );
                  }}
                >
                  <MyIcon name={renderTypeData?.icon as any} w={'14px'} />
                </Button>
              </MyTooltip>
            </Flex>

            {/* Render input components */}
            {(() => {
              if (updateItem.renderType === FlowNodeInputTypeEnum.reference) {
                return (
                  <VariableSelector
                    nodeId={nodeId}
                    variable={updateItem.value}
                    valueType={valueType}
                    onSelect={onUpdateNewValue}
                  />
                );
              }

              const inputValue = isArray(updateItem.value?.[1]) ? '' : updateItem.value?.[1];

              if (valueType === WorkflowIOValueTypeEnum.string) {
                return (
                  <Box w={'300px'}>
                    <PromptEditor
                      value={inputValue || ''}
                      onChange={onUpdateNewValue}
                      showOpenModal={false}
                      variableLabels={variables}
                      variables={[...variables, ...externalProviderWorkflowVariables]}
                      minH={100}
                    />
                  </Box>
                );
              }
              if (valueType === WorkflowIOValueTypeEnum.number) {
                return (
                  <MyNumberInput
                    inputFieldProps={{ bg: 'white' }}
                    value={Number(inputValue) || 0}
                    onChange={(e) => onUpdateNewValue(String(e || 0))}
                  />
                );
              }
              if (valueType === WorkflowIOValueTypeEnum.boolean) {
                return (
                  <Switch
                    defaultChecked={inputValue === 'true'}
                    onChange={(e) => onUpdateNewValue(String(e.target.checked))}
                  />
                );
              }

              return (
                <Box w={'300px'}>
                  <PromptEditor
                    value={inputValue || ''}
                    onChange={onUpdateNewValue}
                    showOpenModal={false}
                    variableLabels={variables}
                    variables={[...variables, ...externalProviderWorkflowVariables]}
                    minH={100}
                  />
                </Box>
              );
            })()}
          </Flex>
        </Container>
      );
    }
  );

  const Render = useMemo(() => {
    return (
      <NodeCard selected={selected} maxW={'1000px'} {...data}>
        <Box px={4} pb={4}>
          <Flex flexDirection={'column'} gap={4}>
            {updateList.map((updateItem, index) => (
              <ValueRender key={index} updateItem={updateItem} index={index} />
            ))}
          </Flex>
          <Flex
            className="nodrag"
            cursor={'default'}
            alignItems={'center'}
            position={'relative'}
            mt={4}
          >
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
  }, [ValueRender, data, onUpdateList, selected, t, updateList]);

  return Render;
};
export default React.memo(NodeVariableUpdate);

const VariableSelector = ({
  nodeId,
  variable,
  valueType,
  onSelect
}: {
  nodeId: string;
  variable?: ReferenceValueType;
  valueType?: WorkflowIOValueTypeEnum;
  onSelect: (e?: ReferenceValueType) => void;
}) => {
  const { t } = useTranslation();

  const { referenceList } = useReference({
    nodeId,
    valueType
  });

  return (
    <ReferSelector
      placeholder={t('common:select_reference_variable')}
      list={referenceList}
      value={variable}
      onSelect={onSelect}
      isArray={valueType?.includes('array')}
    />
  );
};
