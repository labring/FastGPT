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
  InteractiveBasicType,
  UserInputInteractive,
  UserSelectInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import MyIcon from '@fastgpt/web/components/common/Icon';

export const RenderUserSelectInteractive = React.memo(function RenderInteractive({
  interactive,
  nodeId
}: {
  interactive: UserSelectInteractive;
  nodeId?: string;
}) {
  const { t } = useTranslation();
  const [selectedValue, setSelectedValue] = useState<string | undefined>(undefined);
  const { onChangeNode, onNextNodeDebug, workflowDebugData, setWorkflowDebugData } =
    useContextSelector(WorkflowContext, (v) => ({
      onChangeNode: v.onChangeNode,
      onNextNodeDebug: v.onNextNodeDebug,
      workflowDebugData: v.workflowDebugData,
      setWorkflowDebugData: v.setWorkflowDebugData
    }));

  const handleSelect = useCallback(
    (value: string) => {
      if (!nodeId || !workflowDebugData) return;

      // 保存选中的值到本地状态
      setSelectedValue(value);

      // 更新查询以包含用户的选择
      const updatedQuery: UserChatItemValueItemType[] = [
        ...(workflowDebugData.query || []),
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: value
          }
        } as UserChatItemValueItemType
      ];

      // 更新工作流调试数据
      setWorkflowDebugData({
        ...workflowDebugData,
        query: updatedQuery
      });
    },
    [nodeId, onChangeNode, workflowDebugData, setWorkflowDebugData]
  );

  // 处理下一步调试的逻辑
  const handleStartDebug = useCallback(() => {
    if (!nodeId || !workflowDebugData) return;

    // 先将当前节点设置为入口节点
    onChangeNode({
      nodeId,
      type: 'attr',
      key: 'isEntry',
      value: true
    });

    // 然后调用onNextNodeDebug函数
    onNextNodeDebug();
  }, [nodeId, workflowDebugData, onNextNodeDebug, onChangeNode]);

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
          const selected =
            option.value === selectedValue || option.value === interactive?.params?.userSelectedVal;

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
              isDisabled={
                selectedValue !== undefined || interactive?.params?.userSelectedVal !== undefined
              }
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
              onClick={() => handleSelect(option.value)}
            >
              {option.value}
            </Button>
          );
        })}
      </Flex>

      {/* 添加下一步按钮，在选择完成后显示 */}
      {(selectedValue !== undefined || interactive?.params?.userSelectedVal !== undefined) && (
        <Flex justify="flex-end" mt={4}>
          <Button
            size="sm"
            leftIcon={<MyIcon name={'core/workflow/debugNext'} w={'16px'} />}
            colorScheme="blue"
            variant="solid"
            onClick={handleStartDebug}
          >
            {t('common:common.Next Step')}
          </Button>
        </Flex>
      )}
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
  const { register, setValue, handleSubmit: handleSubmitChat, control, reset } = useForm();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { onChangeNode, onNextNodeDebug, workflowDebugData, setWorkflowDebugData } =
    useContextSelector(WorkflowContext, (v) => ({
      onChangeNode: v.onChangeNode,
      onNextNodeDebug: v.onNextNodeDebug,
      workflowDebugData: v.workflowDebugData,
      setWorkflowDebugData: v.setWorkflowDebugData
    }));

  const onSubmit = useCallback(
    (data: any) => {
      if (!nodeId || !workflowDebugData) return;

      // 标记表单已提交
      setIsSubmitted(true);

      const jsonData = JSON.stringify(data);

      // 更新查询以包含用户的表单数据
      const updatedQuery: UserChatItemValueItemType[] = [
        ...(workflowDebugData.query || []),
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: jsonData
          }
        } as UserChatItemValueItemType
      ];

      // 更新工作流调试数据
      setWorkflowDebugData({
        ...workflowDebugData,
        query: updatedQuery
      });
    },
    [nodeId, onChangeNode, workflowDebugData, setWorkflowDebugData]
  );

  // 处理下一步调试的逻辑
  const handleStartDebug = useCallback(() => {
    if (!nodeId || !workflowDebugData) return;

    // 先将当前节点设置为入口节点
    onChangeNode({
      nodeId,
      type: 'attr',
      key: 'isEntry',
      value: true
    });

    // 然后调用onNextNodeDebug函数
    onNextNodeDebug();
  }, [nodeId, workflowDebugData, onNextNodeDebug, onChangeNode]);

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
            {!isSubmitted && !interactive.params.submitted && (
              <Button
                type="submit"
                colorScheme="blue"
                size="md"
                height="44px"
                px={8}
                fontWeight="medium"
                borderRadius="md"
                boxShadow="sm"
                _hover={{ transform: 'translateY(-1px)', boxShadow: 'md' }}
                _active={{ transform: 'translateY(0)' }}
                transition="all 0.2s"
              >
                {t('common:Submit')}
              </Button>
            )}

            {/* 提交完成后显示下一步按钮 */}
            {(isSubmitted || interactive.params.submitted) && (
              <Button
                size="md"
                height="44px"
                leftIcon={<MyIcon name={'core/workflow/debugNext'} w={'16px'} />}
                colorScheme="blue"
                variant="solid"
                onClick={handleStartDebug}
              >
                {t('common:common.Next Step')}
              </Button>
            )}
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
});
