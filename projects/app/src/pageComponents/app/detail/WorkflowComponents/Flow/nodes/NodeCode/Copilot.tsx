import Markdown from '@/components/Markdown';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { onOptimizeCode } from '@/web/common/api/fetch';
import { getModelDefault } from '@/web/core/ai/model/modelData';
import { Box, Button, CloseButton, Flex } from '@chakra-ui/react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { ArrayTypeMap, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  JS_TEMPLATE,
  SandboxCodeTypeEnum
} from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { nanoid } from 'nanoid';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getEditorVariables } from '../../../utils';
import { extractCodeFromMarkdown } from './parser';
import { getOutputDisconnectCommands } from '@/web/core/workflow/utils';
import { useNodeWorkflowDocument } from '../render/useWorkflowDocument';
import { useNode, useWorkflowActions } from '@/web/core/workflow/editor';

export type OnOptimizeCodeProps = {
  optimizerInput: string;
  modelId: string;
  conversationHistory?: Array<ChatCompletionMessageParam>;
  onResult: (result: string) => void;
  abortController?: AbortController;
};

const NodeCopilot = ({
  nodeId,
  inputs: realTimeInputs,
  outputs: realTimeOutputs,
  trigger
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
  trigger: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  // 变量列表只读本节点与其上游来源闭包：窄订阅让无关字段的提交不重算也不重渲染。
  const { workflow, getNodeById, graph } = useNodeWorkflowDocument({ nodeId });
  const node = useNode(nodeId);
  // 边集合只在应用生成代码的回调里读，走非订阅 getter：点击时取当前值，组件不订阅结构变更。
  const { getEdges } = useWorkflowActions();

  const [optimizerInput, setOptimizerInput] = useState('');
  const [codeResult, setCodeResult] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ChatCompletionMessageParam[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const closePopoverRef = useRef<() => void>();

  const isInputEmpty = !optimizerInput.trim();

  const editorVariables = useMemoEnhance(() => {
    if (!workflow) return [];
    return getEditorVariables({
      nodeId,
      getNodeById,
      edges: workflow.edges,
      chatConfig: workflow.chatConfig,
      t,
      getIncomingEdges: graph?.getIncomingEdges
    }).filter((item) => item.parent.id !== nodeId);
  }, [nodeId, getNodeById, graph, workflow, t]);

  const { codeType, code, dynamicInputs, dynamicOutputs } = useMemo(() => {
    const codeTypeInput = realTimeInputs?.find((input) => input.key === NodeInputKeyEnum.codeType);
    const codeInput = realTimeInputs?.find((input) => input.key === NodeInputKeyEnum.code);

    return {
      codeType: codeTypeInput?.value || SandboxCodeTypeEnum.js,
      code: codeInput?.value || JS_TEMPLATE,
      dynamicInputs:
        realTimeInputs?.filter(
          (input) =>
            !['system_addInputParam', 'codeType', NodeInputKeyEnum.code].includes(input.key)
        ) || [],
      dynamicOutputs:
        realTimeOutputs?.filter(
          (output) => !['system_rawResponse', 'error', 'system_addOutputParam'].includes(output.key)
        ) || []
    };
  }, [realTimeInputs, realTimeOutputs]);

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
      // 对话被主动清空后，需要基于最新节点配置重新建立首轮上下文。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConversationHistory(initialConversationHistory);
    }
  }, [conversationHistory, codeType, code, dynamicInputs, dynamicOutputs, t]);

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
  const { runAsync: handleSendOptimization, loading } = useRequest(async () => {
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
      modelId: selectedModel,
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
  /**
   * 应用 Copilot 生成的代码：代码、动态入参、动态出参一次改写。
   * 全部字段同一事务提交（被删出参的连线同事务断开），撤销一次回到应用前。
   */
  const handleApplyCode = () => {
    try {
      const extractedResult = extractCodeFromMarkdown(codeResult);
      const { code, inputs, outputs } = extractedResult;
      const documentInputs = node?.data.inputs;
      const documentOutputs = node?.data.outputs;
      if (!documentInputs || !documentOutputs) return;

      // 动态入参整体重建：先剔除旧的动态入参，再按生成结果追加，保留固定字段的位置。
      const dynamicInputKeys = new Set(dynamicInputs.map((input) => input.key));
      const nextInputs = documentInputs
        .filter((input) => !dynamicInputKeys.has(input.key))
        .map((input) => (input.key === NodeInputKeyEnum.code ? { ...input, value: code } : input))
        .concat(
          inputs.map((input) => {
            const referenceValue = (() => {
              if (input.reference) {
                const [sourceNodeId, outputKey] = input.reference.split('.');
                if (sourceNodeId && outputKey) {
                  return [sourceNodeId, outputKey];
                }
              }
              return [];
            })();

            return {
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
            };
          })
        );

      // 出参按 key 复用原 id 与位置，生成结果里没有的旧出参删除并断开其 handle 连线。
      const existingOutputKeys = new Set(dynamicOutputs.map((output) => output.key));
      const removedOutputKeys = dynamicOutputs
        .filter((output) => !outputs.some((item) => item.label === output.key))
        .map((output) => output.key);
      const nextOutputs = documentOutputs
        .filter((output) => !removedOutputKeys.includes(output.key))
        .map((output) => {
          const extracted = outputs.find((item) => item.label === output.key);
          if (!extracted) return output;
          return {
            ...output,
            type: FlowNodeOutputTypeEnum.dynamic,
            valueType: extracted.type as WorkflowIOValueTypeEnum,
            label: extracted.label,
            valueDesc: '',
            description: ''
          };
        })
        .concat(
          outputs
            .filter((output) => !existingOutputKeys.has(output.label))
            .map((output) => ({
              id: nanoid(),
              type: FlowNodeOutputTypeEnum.dynamic,
              key: output.label,
              valueType: output.type as WorkflowIOValueTypeEnum,
              label: output.label,
              valueDesc: '',
              description: ''
            }))
        );

      // 同一事务内逐条删边会移动后续下标，合并后统一按降序给出。
      const disconnectEdges = removedOutputKeys
        .flatMap((outputKey) =>
          getOutputDisconnectCommands({ edges: getEdges(), nodeId, outputKey })
        )
        .sort((a, b) => b.index - a.index);

      node?.updateNode(() => ({ inputs: nextInputs, outputs: nextOutputs }), { disconnectEdges });
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
      onOpenFunc={() => {
        if (!selectedModel)
          getModelDefault({ modelType: ModelTypeEnum.llm })
            .then((model) => {
              if (model) setSelectedModel((current) => current || model.modelId);
            })
            .catch(() => {});
      }}
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
              {
                <AIModelSelector
                  modelType={ModelTypeEnum.llm}
                  borderColor="transparent"
                  _hover={{ border: '1px solid', borderColor: 'primary.400' }}
                  size="sm"
                  value={selectedModel}
                  onChange={setSelectedModel}
                />
              }
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
