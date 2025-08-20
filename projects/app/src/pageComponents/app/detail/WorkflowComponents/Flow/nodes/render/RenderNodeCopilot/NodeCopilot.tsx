import React, { useMemo, useState } from 'react';
import { Box, Button, Card, CloseButton, Flex, Textarea } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import AIModelSelector from '@/components/Select/AIModelSelector';
import Markdown from '@/components/Markdown';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { onOptimizeCode } from '@/web/common/api/fetch';
import { testCode } from '@/web/core/workflow/api/copilot';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import {
  ArrayTypeMap,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { WorkflowContext } from '../../../../context';
import { WorkflowNodeEdgeContext } from '../../../../context/workflowInitContext';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { nanoid } from 'nanoid';

export type OnOptimizeCodeProps = {
  language: string;
  optimizerInput: string;
  model: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onResult: (result: string) => void;
  abortController?: AbortController;
};

const NodeCopilot = ({ nodeId, onClose }: { nodeId: string; onClose?: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { llmModelList, defaultModels } = useSystemStore();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);

  const [optimizerInput, setOptimizerInput] = useState('');
  const [codeResult, setCodeResult] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModels.llm?.model || '');

  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const extractCodeFromMarkdown = (
    markdown: string
  ): {
    code: string;
    inputs: Array<{ label: string; type: string }>;
    outputs: Array<{ label: string; type: string }>;
  } => {
    const codeBlockRegex = /```(?:\w+\n)?([\s\S]*?)```/;
    const match = markdown.match(codeBlockRegex);
    const code = match ? match[1].trim() : markdown.trim();

    const inputs: Array<{ label: string; type: string }> = [];
    const outputs: Array<{ label: string; type: string }> = [];

    const nestedParamRegex = /@param\s*\{([^}]+)\}\s*params\.(\w+)\s*-?\s*.*/g;
    let nestedParamMatch;
    while ((nestedParamMatch = nestedParamRegex.exec(code)) !== null) {
      const type = nestedParamMatch[1].trim();
      const label = nestedParamMatch[2].trim();
      inputs.push({ label, type });
    }

    if (inputs.length === 0) {
      const paramRegex = /@param\s*\{([^}]+)\}\s*(\w+)\s*-?\s*.*/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(code)) !== null) {
        const type = paramMatch[1].trim();
        const label = paramMatch[2].trim();
        inputs.push({ label, type });
      }
    }

    const propertyRegex = /@property\s*\{([^}]+)\}\s*(\w+)\s*-?\s*.*/g;
    let propertyMatch;
    while ((propertyMatch = propertyRegex.exec(code)) !== null) {
      const type = propertyMatch[1].trim();
      const label = propertyMatch[2].trim();
      outputs.push({ label, type });
    }

    if (outputs.length === 0) {
      const returnRegex = /return\s*\{\s*([^}]+)\s*\}/;
      const returnMatch = code.match(returnRegex);
      if (returnMatch) {
        const returnContent = returnMatch[1];
        const returnProperties = returnContent.split(',').map((prop) => prop.trim());
        returnProperties.forEach((prop) => {
          const cleanProp = prop.replace(/\s*:.*$/, '').trim();
          if (cleanProp) {
            outputs.push({ label: cleanProp, type: 'any' });
          }
        });
      }
    }

    return { code, inputs, outputs };
  };

  const handleApplyCode = () => {
    try {
      const extractedResult = extractCodeFromMarkdown(codeResult);
      const { code, inputs, outputs } = extractedResult;

      const currentNode = nodeList.find((node) => node.nodeId === nodeId);
      const codeInput = currentNode?.inputs?.find((input) => input.key === NodeInputKeyEnum.code);

      if (!codeInput || !currentNode) {
        return;
      }

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.code,
        value: {
          ...codeInput,
          value: code
        }
      });

      const dynamicInputs =
        currentNode.inputs?.filter(
          (input) =>
            input.key !== 'system_addInputParam' &&
            input.key !== 'codeType' &&
            input.key !== NodeInputKeyEnum.code
        ) || [];

      dynamicInputs.forEach((input) => {
        onChangeNode({
          nodeId,
          type: 'delInput',
          key: input.key
        });
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
          (output) =>
            output.key !== 'system_rawResponse' &&
            output.key !== 'error' &&
            output.key !== 'system_addOutputParam'
        ) || [];

      dynamicOutputs.forEach((output) => {
        onChangeNode({
          nodeId,
          type: 'delOutput',
          key: output.key
        });
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

  const handleClose = () => {
    onClose?.();
  };

  const selectedLanguage = useMemo(() => {
    const currentNode = nodeList.find((node) => node.nodeId === nodeId);
    const codeTypeInput = currentNode?.inputs?.find(
      (input) => input.key === NodeInputKeyEnum.codeType
    );
    return codeTypeInput?.value || 'js';
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

  const isInputEmpty = !optimizerInput.trim();

  const { runAsync: handleSendOptimization, loading } = useRequest2(async () => {
    if (isInputEmpty) return;

    const currentInput = optimizerInput;

    setOptimizerInput('');
    setCodeResult('');

    const newConversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...conversationHistory,
      { role: 'user' as const, content: currentInput }
    ];
    setConversationHistory(newConversationHistory);

    const controller = new AbortController();
    setAbortController(controller);

    let fullResponse = '';

    await onOptimizeCode({
      language: selectedLanguage,
      optimizerInput: currentInput,
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

    if (!code || inputs.length === 0 || outputs.length === 0) {
      toast({
        status: 'warning',
        title: t('app:test_code_incomplete')
      });
      return;
    }

    try {
      const summary = await testCode({
        code,
        codeType: selectedLanguage,
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

  const handleStopRequest = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!loading) {
        handleSendOptimization();
      }
    }
  };

  return (
    <Card
      className="nowheel"
      position={'absolute'}
      right={'-492px'}
      top={0}
      zIndex={10}
      w={'482px'}
      border={'base'}
      p={4}
    >
      <Flex justify="space-between" align="center" pb={2}>
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
        {onClose && <CloseButton onClick={handleClose} />}
      </Flex>

      <Box mb={3}>
        {codeResult && (
          <Box
            px={'10px'}
            maxHeight={'300px'}
            overflowY={'auto'}
            fontSize={'14px'}
            color={'gray.700'}
            mb={4}
          >
            <Markdown source={codeResult} />
          </Box>
        )}
        {loading && (
          <Flex mb={3} ml={4}>
            <MyIcon name="common/ellipsis" w={6} color="myGray.400" />
          </Flex>
        )}
        <Flex
          alignItems="center"
          gap={2}
          border="1px solid"
          borderColor="gray.200"
          borderRadius="md"
          p={2}
          _focusWithin={{ borderColor: 'primary.600' }}
        >
          <MyIcon name="optimizer" alignSelf={'flex-start'} mt={0.5} w={5} />
          <Textarea
            placeholder={t('app:code_function_describe')}
            resize="none"
            rows={1}
            minHeight="24px"
            lineHeight="24px"
            maxHeight="96px"
            overflowY="hidden"
            border="none"
            _focus={{ boxShadow: 'none' }}
            fontSize="sm"
            p={0}
            borderRadius="none"
            value={optimizerInput}
            autoFocus
            onKeyDown={handleKeyDown}
            isDisabled={loading}
            onChange={(e) => {
              const textarea = e.target;
              setOptimizerInput(e.target.value);

              textarea.style.height = '24px';
              const maxHeight = 96;
              const newHeight = Math.min(textarea.scrollHeight, maxHeight);
              textarea.style.height = `${newHeight}px`;
              textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
            }}
            flex={1}
          />
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
    </Card>
  );
};

export default React.memo(NodeCopilot);
