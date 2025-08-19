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
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowContext } from '../../../../context';
import { useTranslation } from 'next-i18next';

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
  const { llmModelList, defaultModels } = useSystemStore();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const [optimizerInput, setOptimizerInput] = useState('');
  const [codeResult, setCodeResult] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModels.llm?.model || '');

  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

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
            placeholder="描述你需要生成的代码功能..."
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
                void handleSendOptimization();
              }
            }}
          />
        </Flex>
      </Box>

      {codeResult && !loading && (
        <Flex gap={3} w="full" justifyContent={'end'}>
          <Button variant="whiteBase" size="md" h={10} px={5}>
            {t('app:test_code')}
          </Button>
          <Button variant="primary" size="md" h={10} px={5} onClick={() => console.log('应用代码')}>
            {t('app:apply_code')}
          </Button>
        </Flex>
      )}
    </Card>
  );
};

export default React.memo(NodeCopilot);
