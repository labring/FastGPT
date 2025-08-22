import React, { useMemo, useRef, useState } from 'react';
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
import { testCode } from '@/web/core/workflow/api/copilot';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { extractCodeFromMarkdown } from '@/web/core/workflow/utils';
import {
  ArrayTypeMap,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { WorkflowContext } from '../../../../context';
import { useTranslation } from 'next-i18next';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { AppContext } from '../../../../../context';
import { WorkflowNodeEdgeContext } from '../../../../context/workflowInitContext';
import { useCreation } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { nanoid } from 'nanoid';
import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import { getEditorVariables } from '../../../../utils';

export type OnOptimizeCodeProps = {
  codeType: SandboxCodeTypeEnum;
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
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const [optimizerInput, setOptimizerInput] = useState('');
  const [codeResult, setCodeResult] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModels.llm?.model || '');
  const [conversationHistory, setConversationHistory] = useState<ChatCompletionMessageParam[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const closePopoverRef = useRef<() => void>();

  const isInputEmpty = !optimizerInput.trim();

  const editorVariables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);

  const codeType = useMemo(() => {
    const currentNode = nodeList.find((node) => node.nodeId === nodeId);
    const codeTypeInput = currentNode?.inputs?.find(
      (input) => input.key === NodeInputKeyEnum.codeType
    );
    return codeTypeInput?.value || SandboxCodeTypeEnum.js;
  }, [nodeList, nodeId]);

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

  const { runAsync: handleSendOptimization, loading } = useRequest2(async () => {
    setOptimizerInput('');
    setCodeResult('');
    const newConversationHistory = [
      ...conversationHistory,
      {
        role: 'user' as const,
        content: optimizerInput
      }
    ];
    setConversationHistory(newConversationHistory);
    const controller = new AbortController();
    setAbortController(controller);

    let fullResponse = '';

    await onOptimizeCode({
      codeType,
      optimizerInput,
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
      setAbortController(null);
    } else {
      setAbortController(null);
    }
  });
  const { runAsync: handleTestCode, loading: testCodeLoading } = useRequest2(async () => {
    if (!codeResult) return;
    const { code, inputs, outputs } = extractCodeFromMarkdown(codeResult);

    if (!code) {
      toast({
        status: 'warning',
        title: t('app:test_code_incomplete')
      });
      return;
    }

    try {
      const summary = await testCode({
        code,
        codeType,
        model: selectedModel,
        inputs,
        outputs
      });

      const isAllPassed = summary.passed === summary.total;

      toast({
        status: isAllPassed ? 'success' : 'error',
        title: isAllPassed
          ? t('app:test_all_passed')
          : `${t('app:test_failed_with_progress', { passed: summary.passed, total: summary.total })}`
      });
    } catch (error) {
      toast({
        status: 'error',
        title: t('app:test_execution_failed')
      });
    }
  });
  const handleApplyCode = () => {
    try {
      const extractedResult = extractCodeFromMarkdown(codeResult);
      const { code, inputs, outputs } = extractedResult;
      const currentNode = nodeList.find((node) => node.nodeId === nodeId);
      const codeInput = currentNode?.inputs?.find((input) => input.key === NodeInputKeyEnum.code);
      if (!codeInput || !currentNode) return;
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.code,
        value: { ...codeInput, value: code }
      });

      const dynamicInputs =
        currentNode.inputs?.filter(
          (input) =>
            !['system_addInputParam', 'codeType', NodeInputKeyEnum.code].includes(input.key)
        ) || [];
      dynamicInputs.forEach((input) => {
        onChangeNode({ nodeId, type: 'delInput', key: input.key });
      });
      inputs.forEach((input) => {
        onChangeNode({
          nodeId,
          type: 'addInput',
          value: {
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: input.type as WorkflowIOValueTypeEnum,
            canEdit: true,
            key: input.label,
            label: input.label,
            customInputConfig: {
              selectValueTypeList: Object.values(ArrayTypeMap),
              showDescription: false,
              showDefaultValue: true
            },
            required: true
          }
        });
      });

      const dynamicOutputs =
        currentNode.outputs?.filter(
          (output) => !['system_rawResponse', 'error', 'system_addOutputParam'].includes(output.key)
        ) || [];
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

      toast({
        status: 'success',
        title: t('common:code_applied_successfully')
      });
    } catch (error) {
      toast({
        status: 'error',
        title: t('common:apply_code_failed')
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
              <CloseButton onClick={onClose} />
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
                    variables={editorVariables}
                    showOpenModal={false}
                    minH={24}
                    maxH={96}
                    isDisabled={loading}
                    onKeyDown={handleKeyDown}
                    boxStyle={{
                      border: 'none',
                      padding: '1px 0',
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
                <Button
                  variant="whiteBase"
                  size="md"
                  h={10}
                  px={5}
                  isLoading={testCodeLoading}
                  loadingText={t('app:testing')}
                  onClick={handleTestCode}
                >
                  {t('app:test_code')}
                </Button>
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
