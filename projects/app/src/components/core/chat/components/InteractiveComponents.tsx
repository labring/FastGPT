import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Flex, Textarea, FormLabel as ChakraFormLabel } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { Controller, useForm } from 'react-hook-form';
import Markdown from '@/components/Markdown';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  UserInputInteractive,
  UserSelectInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { StoreEdgeItemType, RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { initWorkflowEdgeStatus } from '@fastgpt/global/core/workflow/runtime/utils';

export const RenderUserSelectInteractive = React.memo(function RenderInteractive({
  interactive,
  nodeId
}: {
  interactive: UserSelectInteractive;
  nodeId?: string;
}) {
  const { t } = useTranslation();

  // 在两个组件中更新上下文选择器，添加 onStartNodeDebug
  const { onStartNodeDebug, workflowDebugData } = useContextSelector(WorkflowContext, (v) => ({
    onStartNodeDebug: v.onStartNodeDebug,
    // onNextNodeDebug: v.onNextNodeDebug, // 不再使用
    workflowDebugData: v.workflowDebugData
  }));

  /**
   * 创建交互数据结构
   * @param nodeId 交互节点ID
   * @param interactive 交互组件数据
   * @param edges 当前的边数组
   * @returns 交互数据结构
   */
  const createInteractiveData = (
    nodeId: string,
    interactive: UserSelectInteractive | UserInputInteractive,
    edges: StoreEdgeItemType[]
  ) => {
    // 创建 memoryEdges - 指向交互节点的边设为 active
    const memoryEdges: RuntimeEdgeItemType[] = edges.map((edge) => ({
      ...edge,
      status: edge.target === nodeId ? ('active' as const) : ('waiting' as const)
    }));

    return {
      ...interactive,
      entryNodeIds: [nodeId],
      memoryEdges,
      nodeOutputs: [] // 如果有需要可以填充节点输出数据
    };
  };

  /**
   * 创建模拟的历史记录
   * @param nodeId 交互节点ID
   * @param interactive 交互组件数据
   * @param edges 当前的边数组
   * @returns 模拟的历史记录
   */
  const createMockHistory = (
    nodeId: string,
    interactive: UserSelectInteractive | UserInputInteractive,
    edges: StoreEdgeItemType[]
  ): ChatItemType[] => {
    const interactiveData = createInteractiveData(nodeId, interactive, edges);

    return [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            type: ChatItemValueTypeEnum.interactive,
            interactive: interactiveData
          }
        ]
      }
    ];
  };

  // 合并选择和下一步操作
  const handleSelectAndNext = useCallback(
    (value: string) => {
      if (!nodeId || !workflowDebugData) return;

      // 创建包含用户选择的查询数据
      const updatedQuery: UserChatItemValueItemType[] = [
        ...(workflowDebugData.query || []),
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: value || ''
          }
        } as UserChatItemValueItemType
      ];

      // 创建模拟的历史记录
      const mockHistory = createMockHistory(nodeId, interactive, workflowDebugData.runtimeEdges);

      // 使用模拟的历史记录初始化边状态
      const updatedRuntimeEdges = initWorkflowEdgeStatus(
        workflowDebugData.runtimeEdges,
        mockHistory
      );

      // 更新 runtimeNodes 以反映用户的选择
      const updatedRuntimeNodes = workflowDebugData.runtimeNodes.map((node) => {
        if (node.nodeId === nodeId) {
          // 找到我们需要的输入字段并更新它
          return {
            ...node,
            inputs: node.inputs.map((input) => {
              // 根据您的实际字段结构，这里可能需要调整
              if (input.key === 'userSelect' || input.key === 'selectedOption') {
                return {
                  ...input,
                  value: value
                };
              }
              return input;
            }),
            // 添加或更新任何需要的节点属性
            userSelectedVal: value
          };
        }
        return node;
      });

      // 使用 onStartNodeDebug 替代 onNextNodeDebug，带上更新后的 nodes 和 edges
      onStartNodeDebug({
        entryNodeId: nodeId,
        runtimeNodes: updatedRuntimeNodes,
        runtimeEdges: updatedRuntimeEdges,
        variables: workflowDebugData.variables,
        query: updatedQuery,
        history: mockHistory
      });
    },
    [nodeId, workflowDebugData, onStartNodeDebug, interactive]
  );

  return (
    <Box px={4} py={3}>
      {interactive?.params?.description && (
        <Box
          mb={4}
          p={3}
          borderLeft="4px solid"
          borderColor="primary.100"
          bg="primary.50"
          borderRadius="md"
        >
          <Markdown source={interactive.params.description} />
        </Box>
      )}
      <Flex flexDirection={'column'} gap={3} maxW={'400px'} mx="auto">
        {interactive.params.userSelectOptions?.map((option) => {
          const selected = option.value === interactive?.params?.userSelectedVal;

          return (
            <Button
              key={option.key}
              variant={'outline'}
              height="auto"
              py={3}
              px={4}
              fontWeight="medium"
              borderWidth="1.5px"
              whiteSpace={'pre-wrap'}
              _hover={{
                bg: 'primary.50',
                borderColor: 'primary.300'
              }}
              isDisabled={interactive?.params?.userSelectedVal !== undefined}
              {...(selected
                ? {
                    borderColor: 'primary.500',
                    bg: 'primary.50',
                    color: 'primary.700',
                    _disabled: {
                      cursor: 'default',
                      borderColor: 'primary.500',
                      bg: 'primary.50 !important',
                      color: 'primary.700',
                      opacity: 1
                    }
                  }
                : {})}
              onClick={() => handleSelectAndNext(option.value)}
            >
              {option.value}
            </Button>
          );
        })}
      </Flex>
    </Box>
  );
});
export const RenderUserFormInteractive = React.memo(function RenderFormInput({
  interactive,
  nodeId
}: {
  interactive: UserInputInteractive;
  nodeId?: string;
}) {
  const { t } = useTranslation();
  const {
    register,
    setValue,
    handleSubmit: handleSubmitChat,
    control,
    reset,
    getValues
  } = useForm();
  const [isSubmitted, setIsSubmitted] = useState(false);
  // 在两个组件中更新上下文选择器，添加 onStartNodeDebug
  const { onStartNodeDebug, workflowDebugData } = useContextSelector(WorkflowContext, (v) => ({
    onStartNodeDebug: v.onStartNodeDebug,
    workflowDebugData: v.workflowDebugData
  }));

  /**
   * 创建交互数据结构
   * @param nodeId 交互节点ID
   * @param interactive 交互组件数据
   * @param edges 当前的边数组
   * @returns 交互数据结构
   */
  const createInteractiveData = (
    nodeId: string,
    interactive: UserInputInteractive,
    edges: StoreEdgeItemType[]
  ) => {
    // 创建 memoryEdges - 指向交互节点的边设为 active
    const memoryEdges: RuntimeEdgeItemType[] = edges.map((edge) => ({
      ...edge,
      status: edge.target === nodeId ? ('active' as const) : ('waiting' as const)
    }));

    return {
      ...interactive,
      entryNodeIds: [nodeId],
      memoryEdges,
      nodeOutputs: [] // 如果有需要可以填充节点输出数据
    };
  };

  /**
   * 创建模拟的历史记录
   * @param nodeId 交互节点ID
   * @param interactive 交互组件数据
   * @param edges 当前的边数组
   * @returns 模拟的历史记录
   */
  const createMockHistory = (
    nodeId: string,
    interactive: UserInputInteractive,
    edges: StoreEdgeItemType[]
  ): ChatItemType[] => {
    // 创建一个新的 interactive 对象，确保 submitted 为 false
    const adjustedInteractive = {
      ...interactive,
      params: {
        ...interactive.params,
        submitted: false // 关键修改点：确保 submitted 为 false
      }
    };

    const interactiveData = createInteractiveData(nodeId, adjustedInteractive, edges);

    return [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            type: ChatItemValueTypeEnum.interactive,
            interactive: interactiveData
          }
        ]
      }
    ];
  };

  const onSubmit = useCallback(
    (data: any) => {
      if (!nodeId || !workflowDebugData) return;

      setIsSubmitted(true);

      // 直接调用 handleStartDebug，合并提交和下一步操作
      const formData = getValues();

      const updatedQuery: UserChatItemValueItemType[] = [
        ...(workflowDebugData.query || []),
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: JSON.stringify(formData)
          }
        } as UserChatItemValueItemType
      ];

      const updatedInteractive = {
        ...interactive,
        params: {
          ...interactive.params,
          submitted: true
        }
      };

      const mockHistory = createMockHistory(
        nodeId,
        updatedInteractive,
        workflowDebugData.runtimeEdges
      );

      const updatedRuntimeEdges = initWorkflowEdgeStatus(
        workflowDebugData.runtimeEdges,
        mockHistory
      );

      const updatedRuntimeNodes = workflowDebugData.runtimeNodes.map((node) => {
        if (node.nodeId === nodeId) {
          return {
            ...node,
            inputs: node.inputs.map((input) => {
              const formField = interactive.params.inputForm?.find(
                (field) => field.label === input.key || field.key === input.key
              );

              if (formField) {
                return {
                  ...input,
                  value: formData[formField.label]
                };
              }
              return input;
            }),
            formSubmitted: true
          };
        }
        return node;
      });

      onStartNodeDebug({
        entryNodeId: nodeId,
        runtimeNodes: updatedRuntimeNodes,
        runtimeEdges: updatedRuntimeEdges,
        variables: workflowDebugData.variables,
        query: updatedQuery,
        history: mockHistory
      });
    },
    [nodeId, workflowDebugData, onStartNodeDebug, getValues, interactive]
  );

  useEffect(() => {
    if (interactive.type === 'userInput') {
      const defaultValues = interactive.params.inputForm?.reduce(
        (acc: Record<string, any>, item) => {
          acc[item.label] = !!item.value ? item.value : item.defaultValue;
          return acc;
        },
        {}
      );
      reset(defaultValues);
    }

    // 如果已经有表单结果，标记为已提交
    if (interactive.params.submitted) {
      setIsSubmitted(true);
    }
  }, [interactive, reset, nodeId]);

  return (
    <Box px={4} py={4} bg="white" borderRadius="md">
      {interactive.params.description && (
        <Box
          mb={4}
          p={3}
          borderLeft="4px solid"
          borderColor="blue.100"
          bg="blue.50"
          borderRadius="md"
        >
          <Markdown source={interactive.params.description} />
        </Box>
      )}
      <Box
        as="form"
        onSubmit={handleSubmitChat(onSubmit)}
        maxW="560px"
        mx="auto"
        bg="white"
        p={4}
        borderRadius="md"
      >
        <Flex flexDirection={'column'} gap={5} w={'100%'}>
          {interactive.params.inputForm?.map((input) => (
            <Box key={input.label} mb={2}>
              <Flex mb={2} alignItems={'center'}>
                <FormLabel required={input.required} mb={0} fontWeight="medium" color="gray.700">
                  {input.label}
                </FormLabel>
                {input.description && <QuestionTip ml={1} label={input.description} />}
              </Flex>
              {input.type === FlowNodeInputTypeEnum.input && (
                <MyTextarea
                  isDisabled={isSubmitted || interactive.params.submitted}
                  {...register(input.label, {
                    required: input.required
                  })}
                  bg={'white'}
                  borderWidth="1px"
                  borderColor="gray.300"
                  _hover={{ borderColor: 'gray.400' }}
                  _focus={{
                    borderColor: 'primary.500',
                    boxShadow: '0 0 0 1px var(--chakra-colors-primary-500)'
                  }}
                  autoHeight
                  minH={40}
                  maxH={100}
                  borderRadius="md"
                  p={3}
                />
              )}
              {input.type === FlowNodeInputTypeEnum.textarea && (
                <Textarea
                  isDisabled={isSubmitted || interactive.params.submitted}
                  bg={'white'}
                  borderWidth="1px"
                  borderColor="gray.300"
                  _hover={{ borderColor: 'gray.400' }}
                  _focus={{
                    borderColor: 'primary.500',
                    boxShadow: '0 0 0 1px var(--chakra-colors-primary-500)'
                  }}
                  {...register(input.label, {
                    required: input.required
                  })}
                  rows={5}
                  maxLength={input.maxLength || 4000}
                  borderRadius="md"
                  p={3}
                />
              )}
              {input.type === FlowNodeInputTypeEnum.numberInput && (
                <Box position="relative">
                  <MyNumberInput
                    min={input.min}
                    max={input.max}
                    defaultValue={input.defaultValue}
                    isDisabled={isSubmitted || interactive.params.submitted}
                    bg={'white'}
                    borderWidth="1px"
                    borderRadius="md"
                    borderColor="gray.300"
                    _hover={{ borderColor: 'gray.400' }}
                    _focus={{ borderColor: 'primary.500' }}
                    register={register}
                    name={input.label}
                    isRequired={input.required}
                    sx={{
                      '& input': {
                        width: '100%',
                        height: '40px',
                        px: 3,
                        borderRadius: 'md',
                        border: 'none',
                        _focus: { outline: 'none' }
                      },
                      '& button': {
                        border: 'none',
                        bg: 'transparent',
                        color: 'gray.500'
                      }
                    }}
                  />
                </Box>
              )}
              {input.type === FlowNodeInputTypeEnum.select && (
                <Controller
                  key={input.label}
                  control={control}
                  name={input.label}
                  rules={{ required: input.required }}
                  render={({ field: { ref, value } }) => {
                    if (!input.list) return <></>;
                    return (
                      <MySelect
                        ref={ref}
                        width={'100%'}
                        variant="outline"
                        borderColor="gray.300"
                        borderRadius="md"
                        height="40px"
                        bg="white"
                        _hover={{ borderColor: 'gray.400' }}
                        list={input.list}
                        value={value}
                        isDisabled={isSubmitted || interactive.params.submitted}
                        onChange={(e) => setValue(input.label, e)}
                      />
                    );
                  }}
                />
              )}
            </Box>
          ))}

          <Flex w={'full'} justifyContent={'flex-end'} mt={3} gap={2}>
            <Button
              type="submit"
              size="sm"
              leftIcon={<MyIcon name={'core/workflow/debugNext'} w={'16px'} />}
              colorScheme="blue"
              variant="solid"
            >
              {t('common:Submit')}
            </Button>
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
});
