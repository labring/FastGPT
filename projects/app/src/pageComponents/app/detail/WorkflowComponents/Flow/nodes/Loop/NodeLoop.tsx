/*
  loop / batch / loopPro 父节点：共用本组件；子画布尺寸与输入区逻辑按 flowNodeType 分支。
*/
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useEffect, useMemo, useRef } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import { useTranslation } from 'next-i18next';
import RenderInput from '../render/RenderInput';
import {
  Box,
  Button,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  VStack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import RenderOutput from '../render/RenderOutput';
import {
  ArrayTypeMap,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  Input_Template_Children_Node_List,
  Input_Template_LOOP_NODE_OFFSET
} from '@fastgpt/global/core/workflow/template/input';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { AppContext } from '../../../../context';
import { isValidArrayReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { type ReferenceArrayValueType } from '@fastgpt/global/core/workflow/type/io';
import { useSize } from 'ahooks';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { WorkflowLayoutContext } from '../../../context/workflowComputeContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import CatchError from '../render/RenderOutput/CatchError';
import { WorkflowUtilsContext } from '../../../context/workflowUtilsContext';

const loopProBodyBg = 'radial-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px)';

const NodeLoop = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs, isFolded, flowNodeType, catchError } = data;
  const isLoopPro = flowNodeType === FlowNodeTypeEnum.loopPro;

  const { getNodeById, nodeIds, nodeAmount, getNodeList, systemConfigNode } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const resetParentNodeSizeAndPosition = useContextSelector(
    WorkflowLayoutContext,
    (v) => v.resetParentNodeSizeAndPosition
  );
  const { splitOutput } = useContextSelector(WorkflowUtilsContext, (v) => v);
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [splitOutput, outputs]
  );

  const displayOutputs = useMemo(
    () =>
      successOutputs.filter(
        (o) => o.key !== NodeOutputKeyEnum.rawResponse && o.key !== NodeOutputKeyEnum.loopArray
      ),
    [successOutputs]
  );

  const loopProMode =
    (inputs.find((i) => i.key === NodeInputKeyEnum.loopProMode)?.value as string) ?? 'array';

  const computedResult = useMemoEnhance(() => {
    return {
      nodeWidth: Math.round(
        Number(inputs.find((input) => input.key === NodeInputKeyEnum.nodeWidth)?.value) || 500
      ),
      nodeHeight: Math.round(
        Number(inputs.find((input) => input.key === NodeInputKeyEnum.nodeHeight)?.value) || 500
      ),
      loopInputArray: inputs.find((input) => input.key === NodeInputKeyEnum.loopInputArray),
      loopNodeInputHeight: inputs.find(
        (input) => input.key === NodeInputKeyEnum.loopNodeInputHeight
      )
    };
  }, [inputs]);
  const nodeWidth = computedResult.nodeWidth;
  const nodeHeight = computedResult.nodeHeight;
  const loopInputArray = useMemoEnhance(
    () => computedResult.loopInputArray,
    [computedResult.loopInputArray]
  );
  const loopNodeInputHeight = computedResult.loopNodeInputHeight ?? Input_Template_LOOP_NODE_OFFSET;

  const newValueType = useMemo(() => {
    if (isLoopPro && loopProMode !== 'array') return WorkflowIOValueTypeEnum.arrayAny;
    if (!loopInputArray) return WorkflowIOValueTypeEnum.arrayAny;
    const value = loopInputArray.value as ReferenceArrayValueType;

    if (!value || value.length === 0 || !isValidArrayReferenceValue(value, nodeIds))
      return WorkflowIOValueTypeEnum.arrayAny;

    const globalVariables = getWorkflowGlobalVariables({
      systemConfigNode,
      chatConfig: appDetail.chatConfig
    });

    const valueType = ((v) => {
      if (v?.[0] === VARIABLE_NODE_ID) {
        return globalVariables.find((item) => item.key === v[1])?.valueType;
      } else {
        const node = getNodeById(v?.[0]);
        const output = node?.outputs.find((output) => output.id === v?.[1]);
        return output?.valueType;
      }
    })(value[0]);
    return ArrayTypeMap[valueType as keyof typeof ArrayTypeMap] ?? WorkflowIOValueTypeEnum.arrayAny;
  }, [
    appDetail.chatConfig,
    getNodeById,
    isLoopPro,
    loopInputArray,
    loopProMode,
    nodeIds,
    systemConfigNode
  ]);

  useEffect(() => {
    if (!loopInputArray) return;
    if (isLoopPro && loopProMode !== 'array') return;
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.loopInputArray,
      value: {
        ...loopInputArray,
        valueType: newValueType
      }
    });
  }, [isLoopPro, loopInputArray, loopProMode, newValueType, nodeId, onChangeNode]);

  useEffect(() => {
    if (flowNodeType !== FlowNodeTypeEnum.batch) return;

    const normalizeInput = ({
      key,
      min,
      max,
      defaultValue
    }: {
      key: NodeInputKeyEnum;
      min: number;
      max: number;
      defaultValue: number;
    }) => {
      const input = inputs.find((item) => item.key === key);
      if (!input) return;

      const num = Math.floor(Number(input.value));
      const nextValue = Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : defaultValue;

      if (input.value === nextValue) return;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key,
        value: {
          ...input,
          value: nextValue
        }
      });
    };

    normalizeInput({
      key: NodeInputKeyEnum.batchParallelConcurrency,
      min: 1,
      max: 10,
      defaultValue: 5
    });
    normalizeInput({
      key: NodeInputKeyEnum.batchParallelRetryTimes,
      min: 0,
      max: 5,
      defaultValue: 3
    });
  }, [flowNodeType, inputs, nodeId, onChangeNode]);

  useEffect(() => {
    if (flowNodeType !== FlowNodeTypeEnum.batch) return;

    const expectedConcurrency = [
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.reference
    ] as const;
    const concurrencyInput = inputs.find(
      (i) => i.key === NodeInputKeyEnum.batchParallelConcurrency
    );
    if (concurrencyInput) {
      const list = concurrencyInput.renderTypeList || [];
      const matches =
        list.length === expectedConcurrency.length &&
        list.every((ty, i) => ty === expectedConcurrency[i]);
      if (!matches) {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: NodeInputKeyEnum.batchParallelConcurrency,
          value: {
            ...concurrencyInput,
            renderTypeList: [...expectedConcurrency],
            selectedTypeIndex: Math.min(Math.max(concurrencyInput.selectedTypeIndex ?? 0, 0), 1)
          }
        });
      }
    }

    const expectedRetry = [FlowNodeInputTypeEnum.numberInput] as const;
    const retryInput = inputs.find((i) => i.key === NodeInputKeyEnum.batchParallelRetryTimes);
    if (retryInput) {
      const list = retryInput.renderTypeList || [];
      const matches = list.length === expectedRetry.length && list[0] === expectedRetry[0];
      if (!matches) {
        const num = Math.floor(Number(retryInput.value));
        const nextValue = Number.isFinite(num) ? Math.max(0, Math.min(5, num)) : 3;
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: NodeInputKeyEnum.batchParallelRetryTimes,
          value: {
            ...retryInput,
            renderTypeList: [...expectedRetry],
            selectedTypeIndex: 0,
            value: nextValue
          }
        });
      }
    }
  }, [flowNodeType, inputs, nodeId, onChangeNode]);

  const loopProModeInput = useMemoEnhance(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.loopProMode),
    [inputs]
  );

  const modeOptions = useMemo(
    () =>
      [
        {
          value: 'array' as const,
          title: t('workflow:loop_pro_mode_array'),
          desc: t('workflow:loop_pro_mode_array_desc'),
          icon: 'core/workflow/inputType/array' as const
        },
        {
          value: 'condition' as const,
          title: t('workflow:loop_pro_mode_condition'),
          desc: t('workflow:loop_pro_mode_condition_desc'),
          icon: 'core/workflow/inputType/ifloop' as const
        }
      ] as const,
    [t]
  );

  const visibleInputs = useMemo(() => {
    if (!isLoopPro) return inputs;
    return inputs.filter((input) => {
      if (input.key === NodeInputKeyEnum.loopProMode) return false;
      if (loopProMode === 'condition' && input.key === NodeInputKeyEnum.loopInputArray)
        return false;
      return true;
    });
  }, [inputs, isLoopPro, loopProMode]);

  const childrenNodeIdList = useMemoEnhance(() => {
    return getNodeList()
      .filter((node) => node.parentNodeId === nodeId)
      .map((node) => node.nodeId);
  }, [nodeId, getNodeList, nodeAmount]);

  useEffect(() => {
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.childrenNodeIdList,
      value: {
        ...Input_Template_Children_Node_List,
        value: childrenNodeIdList
      }
    });
    resetParentNodeSizeAndPosition(nodeId);
  }, [childrenNodeIdList, nodeId, onChangeNode, resetParentNodeSizeAndPosition]);

  const inputBoxRef = useRef<HTMLDivElement>(null);
  const size = useSize(inputBoxRef);
  useEffect(() => {
    if (!size?.height) return;

    onChangeNode({
      nodeId,
      type: 'replaceInput',
      key: NodeInputKeyEnum.loopNodeInputHeight,
      value: {
        ...loopNodeInputHeight,
        value: size.height
      }
    });

    setTimeout(() => {
      resetParentNodeSizeAndPosition(nodeId);
    }, 50);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size?.height]);

  if (isLoopPro) {
    const outputCardProps = {
      bg: '#FBFBFC',
      borderWidth: '1px',
      borderColor: '#F0F1F6',
      borderRadius: '8px',
      p: 4,
      gap: 4
    } as const;

    return (
      <NodeCard
        selected={selected}
        maxW="full"
        menuForbid={{ copy: true }}
        {...data}
        avatar="core/workflow/template/loopPro"
        avatarLinear="core/workflow/template/loopProLinear"
        colorSchema="workflowLoop"
      >
        <Container position={'relative'} flex={1}>
          <IOTitle text={t('common:Input')} />

          <Box mb={6} maxW={'460px'} ref={inputBoxRef}>
            <Box mb={4}>
              <FormLabel required fontWeight={'medium'} color={'myGray.600'}>
                {t('workflow:loop_pro_mode')}
              </FormLabel>
              <Box mt={2} className="nodrag">
                <Menu closeOnSelect strategy="fixed" placement="bottom-start" autoSelect={false}>
                  <MenuButton
                    as={Button}
                    type="button"
                    variant="whitePrimaryOutline"
                    size="lg"
                    fontSize="sm"
                    fontWeight="normal"
                    px={3}
                    w="100%"
                    h="auto"
                    rightIcon={
                      <MyIcon
                        name="core/chat/chevronDown"
                        w="1rem"
                        color="myGray.500"
                        flexShrink={0}
                      />
                    }
                    iconSpacing={2}
                    _active={{ transform: 'none' }}
                    _hover={{ borderColor: 'primary.500' }}
                    _expanded={{
                      borderColor: 'primary.600',
                      color: 'primary.700',
                      boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                      bg: 'white !important'
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Box w="100%" textAlign="left">
                      <Flex alignItems="center" gap={3} minW={0}>
                        <MyIcon
                          name={
                            (modeOptions.find((o) => o.value === loopProMode) ?? modeOptions[0])
                              .icon
                          }
                          w={'16px'}
                          h={'16px'}
                          flexShrink={0}
                        />
                        <Text
                          fontSize="sm"
                          fontWeight="normal"
                          color="myGray.900"
                          noOfLines={1}
                          flex={1}
                          minW={0}
                        >
                          {
                            (modeOptions.find((o) => o.value === loopProMode) ?? modeOptions[0])
                              .title
                          }
                        </Text>
                      </Flex>
                    </Box>
                  </MenuButton>
                  <MenuList
                    minW="280px"
                    maxW="460px"
                    px="6px"
                    py="6px"
                    borderRadius="md"
                    border="1px solid #fff"
                    boxShadow={
                      '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
                    }
                    zIndex={1500}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {modeOptions.map((opt) => {
                      const modeSelected = loopProMode === opt.value;
                      return (
                        <MenuItem
                          key={opt.value}
                          alignItems="flex-start"
                          borderRadius="4px"
                          py={2}
                          px={3}
                          mb={0}
                          bg={modeSelected ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
                          _hover={{ bg: modeSelected ? 'rgba(17, 24, 36, 0.08)' : 'myGray.50' }}
                          _focus={{ bg: modeSelected ? 'rgba(17, 24, 36, 0.08)' : 'myGray.50' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!loopProModeInput || opt.value === loopProMode) return;
                            onChangeNode({
                              nodeId,
                              type: 'updateInput',
                              key: NodeInputKeyEnum.loopProMode,
                              value: {
                                ...loopProModeInput,
                                value: opt.value
                              }
                            });
                          }}
                        >
                          <Flex alignItems="flex-start" gap={3} w="100%">
                            <Box pt="2px">
                              <MyIcon name={opt.icon} w="16px" h="16px" />
                            </Box>
                            <VStack align="stretch" spacing={0} flex={1} minW={0}>
                              <Text
                                fontSize="sm"
                                fontWeight="medium"
                                color={modeSelected ? 'primary.600' : 'myGray.900'}
                                lineHeight="20px"
                              >
                                {opt.title}
                              </Text>
                              <Text fontSize="xs" color="#485264" lineHeight="18px">
                                {opt.desc}
                              </Text>
                            </VStack>
                          </Flex>
                        </MenuItem>
                      );
                    })}
                  </MenuList>
                </Menu>
              </Box>
            </Box>

            <RenderInput nodeId={nodeId} flowInputList={visibleInputs} />
          </Box>

          <FormLabel required fontWeight={'medium'} mb={3} color={'myGray.600'}>
            {t('workflow:loop_body')}
          </FormLabel>
          <Box
            flex={1}
            position={'relative'}
            border={'base'}
            borderColor="rgba(13, 148, 136, 0.2)"
            bg={'myGray.50'}
            backgroundImage={loopProBodyBg}
            backgroundSize="12px 12px"
            rounded={'8px'}
            {...(!isFolded && {
              minW: nodeWidth,
              minH: nodeHeight
            })}
          />
        </Container>
        <Container>
          <Box {...outputCardProps}>
            <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} mb={3} />
            <RenderOutput
              nodeId={nodeId}
              flowOutputList={displayOutputs}
              dynamicOutputReferenceScopeParentId={nodeId}
            />
          </Box>
        </Container>
        {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}
      </NodeCard>
    );
  }

  return (
    <NodeCard selected={selected} maxW="full" menuForbid={{ copy: true }} {...data}>
      <Container position={'relative'} flex={1}>
        <IOTitle text={t('common:Input')} />

        <Box mb={6} maxW={'500px'} ref={inputBoxRef}>
          <RenderInput nodeId={nodeId} flowInputList={visibleInputs} />
        </Box>

        <>
          <FormLabel required fontWeight={'medium'} mb={3} color={'myGray.600'}>
            {flowNodeType === FlowNodeTypeEnum.batch
              ? t('workflow:execution_logic')
              : t('workflow:loop_body')}
          </FormLabel>
          <Box
            flex={1}
            position={'relative'}
            border={'base'}
            bg={'myGray.50'}
            rounded={'8px'}
            {...(!isFolded && {
              minW: nodeWidth,
              minH: nodeHeight
            })}
          />
        </>
      </Container>
      <Container>
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeLoop);
