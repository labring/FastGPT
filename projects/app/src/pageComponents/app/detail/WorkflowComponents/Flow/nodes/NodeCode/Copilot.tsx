import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CloseButton, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import Avatar from '@fastgpt/web/components/common/Avatar';
import AIModelSelector from '@/components/Select/AIModelSelector';
import Markdown from '@/components/Markdown';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { onOptimizeCode } from '@/web/common/api/fetch';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { ArrayTypeMap, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { AppContext } from '../../../../context';
import { useTranslation } from 'next-i18next';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { useCreation } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { nanoid } from 'nanoid';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import {
  JS_TEMPLATE,
  SandboxCodeTypeEnum
} from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import {
  WorkflowBufferDataContext,
  WorkflowNodeDataContext
} from '../../../context/workflowInitContext';
import { getEditorVariables } from '../../../utils';
import { extractCodeFromMarkdown } from './parser';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

export type OnOptimizeCodeProps = {
  optimizerInput: string;
  model: string;
  conversationHistory?: Array<ChatCompletionMessageParam>;
  onResult: (result: string) => void;
  abortController?: AbortController;
};

const NodeCopilot = ({ nodeId, trigger }: { nodeId: string; trigger: React.ReactNode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { llmModelList, defaultModels } = useSystemStore();
  const { edges, systemConfigNode, getNodeById } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const [optimizerInput, setOptimizerInput] = useState('');
  const [codeResult, setCodeResult] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModels.llm?.model || '');
  const [conversationHistory, setConversationHistory] = useState<ChatCompletionMessageParam[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const closePopoverRef = useRef<() => void>();

  const isInputEmpty = !optimizerInput.trim();

  const editorVariables = useMemoEnhance(() => {
    return getEditorVariables({
      nodeId,
      systemConfigNode,
      getNodeById,
      edges,
      appDetail,
      t
    }).filter((item) => item.parent.id !== nodeId);
  }, [nodeId, systemConfigNode, getNodeById, edges, appDetail, t]);

  const { codeType, code, dynamicInputs, dynamicOutputs } = useMemo(() => {
    const currentNode = getNodeById(nodeId);
    const codeTypeInput = currentNode?.inputs?.find(
      (input) => input.key === NodeInputKeyEnum.codeType
    );
    const codeInput = currentNode?.inputs?.find((input) => input.key === NodeInputKeyEnum.code);
    return {
      codeType: codeTypeInput?.value || SandboxCodeTypeEnum.js,
      code: codeInput?.value || JS_TEMPLATE,
      dynamicInputs:
        currentNode?.inputs?.filter(
          (input) =>
            !['system_addInputParam', 'codeType', NodeInputKeyEnum.code].includes(input.key)
        ) || [],
      dynamicOutputs:
        currentNode?.outputs?.filter(
          (output) => !['system_rawResponse', 'error', 'system_addOutputParam'].includes(output.key)
        ) || []
    };
  }, [getNodeById, nodeId]);

  useEffect(() => {
    if (conversationHistory.length === 0) {
      const configMessage = {
        role: 'user' as const,
        content: t('app:copilot_config_message', {
          codeType,
          code,
          inputs: dynamicInputs
            .map((input) => {
              const referenceInfo =
                input.value && Array.isArray(input.value) && input.value.length === 2
                  ? `[${input.value[0]}.${input.value[1]}]`
                  : '';
              return `- ${input.label} (${input.valueType}): ${referenceInfo}`;
            })
            .join('\n'),
          outputs: dynamicOutputs
            .map((output) => `- ${output.label} (${output.valueType})`)
            .join('\n')
        })
      };

      const confirmMessage = {
        role: 'assistant' as const,
        content: t('app:copilot_confirm_message')
      };

      const initialConversationHistory = [configMessage, confirmMessage];
      setConversationHistory(initialConversationHistory);
    }
  }, [conversationHistory, codeType, code, dynamicInputs, dynamicOutputs, t]);

  const modelOptions = useMemo(() => {
    return llmModelList.map((model) => ({
      label: (
        <Flex alignItems="center">
          <Avatar
            src={model.avatar || HUGGING_FACE_ICON}
            fallbackSrc={HUGGING_FACE_ICON}
            mr={1.5}
            w={5}
          />
          <Box fontWeight="normal" fontSize="14px" color="myGray.900">
            {model.name}
          </Box>
        </Flex>
      ),
      value: model.model
    }));
  }, [llmModelList]);

  const replaceVariables = (text: string): string => {
    const variableRegex = /(\{\{([^}]+)\}\}|\$([^$]+)\$)/g;

    return text.replace(variableRegex, (match) => {
      const cleanRef = match.replace(/^\{\{\$|\$\}\}$/g, '');
      const { nodeId, key } = cleanRef.includes('.')
        ? { nodeId: cleanRef.split('.')[0], key: cleanRef.split('.')[1] }
        : { nodeId: '', key: cleanRef };

      const variable = editorVariables.find((v) => {
        return nodeId ? v.key === key && v.parent.id === nodeId : v.key === key;
      });

      if (variable) {
        const currentNode = getNodeById(variable.parent.id);
        const outputVar = currentNode?.outputs?.find((output) => output.id === variable.key);
        const inputVar = currentNode?.inputs?.find((input) => input.key === variable.key);
        const variableType = outputVar?.valueType || inputVar?.valueType;

        return `[param: {paramName:${variable.parent.label}.${variable.label}, paramRefer:${cleanRef}, paramType:${variableType}}]`;
      }
      return match;
    });
  };
  const { runAsync: handleSendOptimization, loading } = useRequest2(async () => {
    if (isInputEmpty) return;

    const processedInput = replaceVariables(optimizerInput);

    setCodeResult('');

    const newConversationHistory = [
      ...conversationHistory,
      {
        role: 'user' as const,
        content: processedInput
      }
    ];
    setConversationHistory(newConversationHistory);
    const controller = new AbortController();
    setAbortController(controller);

    let fullResponse = '';

    await onOptimizeCode({
      optimizerInput: processedInput,
      model: selectedModel,
      conversationHistory,
      onResult: (result: string) => {
        if (!controller.signal.aborted) {
          fullResponse += result;
          setCodeResult(fullResponse);
        }
      },
      abortController: controller
    });

    if (!controller.signal.aborted && fullResponse) {
      setConversationHistory([
        ...newConversationHistory,
        { role: 'assistant' as const, content: fullResponse }
      ]);
    }
    setAbortController(null);
  });
  const handleApplyCode = () => {
    try {
      const extractedResult = extractCodeFromMarkdown(codeResult);
      const { code, inputs, outputs } = extractedResult;
      const currentNode = getNodeById(nodeId);
      const codeInput = currentNode?.inputs?.find((input) => input.key === NodeInputKeyEnum.code);
      if (!codeInput || !currentNode) return;
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.code,
        value: { ...codeInput, value: code }
      });

      dynamicInputs.forEach((input) => {
        onChangeNode({ nodeId, type: 'delInput', key: input.key });
      });
      inputs.forEach((input) => {
        const referenceValue = (() => {
          if (input.reference) {
            const [sourceNodeId, outputKey] = input.reference.split('.');
            if (sourceNodeId && outputKey) {
              return [sourceNodeId, outputKey];
            }
          }
          return [];
        })();

        onChangeNode({
          nodeId,
          type: 'addInput',
          value: {
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: input.type as WorkflowIOValueTypeEnum,
            canEdit: true,
            key: input.label,
            label: input.label,
            value: referenceValue,
            customInputConfig: {
              selectValueTypeList: Object.values(ArrayTypeMap),
              showDescription: false,
              showDefaultValue: true
            },
            required: true
          }
        });
      });
      dynamicOutputs.forEach((output) => {
        onChangeNode({ nodeId, type: 'delOutput', key: output.key });
      });
      outputs.forEach((output) => {
        onChangeNode({
          nodeId,
          type: 'addOutput',
          value: {
            id: nanoid(),
            type: FlowNodeOutputTypeEnum.dynamic,
            key: output.label,
            valueType: output.type as WorkflowIOValueTypeEnum,
            label: output.label,
            valueDesc: '',
            description: ''
          }
        });
      });
      setOptimizerInput('');

      toast({
        status: 'success',
        title: t('app:code_applied_successfully')
      });
    } catch (error) {
      toast({
        status: 'error',
        title: t('app:apply_code_failed')
      });
    }
  };
  const handleStopRequest = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const typeaheadSelectors = [
        '[data-lexical-typeahead-menu]',
        '[role="listbox"]',
        '.typeahead-popover',
        '[data-cy="typeahead-menu"]'
      ];

      const hasActiveTypeahead = typeaheadSelectors.some((selector) =>
        document.querySelector(selector)
      );

      if (hasActiveTypeahead) {
        return;
      }

      e.preventDefault();
      if (!loading && !isInputEmpty) {
        handleSendOptimization();
      }
    }
  };

  return (
    <MyPopover
      Trigger={trigger}
      trigger="click"
      placement="right-start"
      w="482px"
      className="nowheel"
    >
      {({ onClose }) => {
        closePopoverRef.current = onClose;
        return (
          <Box p={4}>
            <Flex align="center" pb={2}>
              {modelOptions.length > 0 && (
                <AIModelSelector
                  borderColor="transparent"
                  _hover={{ border: '1px solid', borderColor: 'primary.400' }}
                  size="sm"
                  value={selectedModel}
                  list={modelOptions}
                  onChange={setSelectedModel}
                />
              )}
              <Box flex={1} />
              <CloseButton
                onClick={() => {
                  setConversationHistory([]);
                  setCodeResult('');
                  onClose();
                }}
              />
            </Flex>

            <Box mb={3}>
              {codeResult && (
                <Box px={'10px'} maxHeight={'300px'} overflowY={'auto'} mb={4}>
                  <Markdown source={codeResult} />
                </Box>
              )}
              {loading && (
                <Flex mb={3} ml={4}>
                  <MyIcon name="common/ellipsis" w={6} color="myGray.400" />
                </Flex>
              )}
              <Flex
                gap={2}
                border="base"
                borderRadius="md"
                p={2}
                _focusWithin={{ borderColor: 'primary.600' }}
              >
                <MyIcon name="optimizer" alignSelf={'flex-start'} mt={0.5} w={5} />
                <Box flex={1}>
                  <PromptEditor
                    placeholder={t('app:code_function_describe')}
                    placeholderPadding="3px 4px"
                    value={optimizerInput}
                    onChange={setOptimizerInput}
                    variableLabels={editorVariables}
                    showOpenModal={false}
                    minH={24}
                    maxH={96}
                    isDisabled={loading}
                    onKeyDown={handleKeyDown}
                    boxStyle={{
                      border: 'none',
                      padding: '0',
                      boxShadow: 'none'
                    }}
                  />
                </Box>
                <MyIcon
                  name={loading ? 'stop' : 'core/chat/sendLight'}
                  w="1rem"
                  alignSelf="flex-end"
                  mb={1}
                  color={loading || !isInputEmpty ? 'primary.600' : 'gray.400'}
                  cursor={loading || !isInputEmpty ? 'pointer' : 'not-allowed'}
                  onClick={() => {
                    if (loading) {
                      handleStopRequest();
                    } else {
                      handleSendOptimization();
                    }
                  }}
                />
              </Flex>
            </Box>

            {codeResult && !loading && (
              <Flex gap={3} w="full" justifyContent={'end'}>
                <Button variant="primary" size="md" h={10} px={5} onClick={handleApplyCode}>
                  {t('app:apply_code')}
                </Button>
              </Flex>
            )}
          </Box>
        );
      }}
    </MyPopover>
  );
};

export default React.memo(NodeCopilot);
