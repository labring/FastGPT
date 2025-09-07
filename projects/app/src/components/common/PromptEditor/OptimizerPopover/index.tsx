import { useMemo, useRef, useState } from 'react';
import type { FlexProps } from '@chakra-ui/react';
import { Box, Button, Flex, Textarea, useDisclosure } from '@chakra-ui/react';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useLocalStorageState } from 'ahooks';
import AIModelSelector from '../../../Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { onOptimizePrompt } from '@/web/common/api/fetch';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

export type OptimizerPromptProps = {
  onChangeText: (text: string) => void;
  defaultPrompt?: string;
};

export type OnOptimizePromptProps = {
  originalPrompt?: string;
  input: string;
  model: string;
  onResult: (result: string) => void;
  abortController?: AbortController;
};

const OptimizerPopover = ({
  onChangeText,
  iconButtonStyle,
  defaultPrompt
}: OptimizerPromptProps & {
  iconButtonStyle?: FlexProps;
}) => {
  const { t } = useTranslation();
  const { llmModelList, defaultModels } = useSystemStore();

  const InputRef = useRef<HTMLTextAreaElement>(null);

  const [optimizerInput, setOptimizerInput] = useState('');
  const [optimizedResult, setOptimizedResult] = useState('');
  const [selectedModel = '', setSelectedModel] = useLocalStorageState<string>(
    'prompt-editor-selected-model',
    {
      defaultValue: defaultModels.llm?.model || ''
    }
  );

  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const { isOpen: isConfirmOpen, onOpen: onOpenConfirm, onClose: onCloseConfirm } = useDisclosure();

  const closePopoverRef = useRef<() => void>();

  const modelOptions = useMemo(() => {
    return llmModelList.map((model) => {
      return {
        label: (
          <Flex alignItems={'center'}>
            <Avatar
              src={model.avatar || HUGGING_FACE_ICON}
              fallbackSrc={HUGGING_FACE_ICON}
              mr={1.5}
              w={5}
            />
            <Box fontWeight={'normal'} fontSize={'14px'} color={'myGray.900'}>
              {model.name}
            </Box>
          </Flex>
        ),
        value: model.model
      };
    });
  }, [llmModelList]);

  const isEmptyOptimizerInput = useMemo(() => {
    return !optimizerInput.trim();
  }, [optimizerInput]);

  const { runAsync: handleSendOptimization, loading } = useRequest2(async (isAuto?: boolean) => {
    if (isEmptyOptimizerInput && !isAuto) return;

    setOptimizedResult('');
    setOptimizerInput('');
    const controller = new AbortController();
    setAbortController(controller);

    await onOptimizePrompt({
      originalPrompt: defaultPrompt,
      input: optimizerInput,
      model: selectedModel,
      onResult: (result: string) => {
        if (!controller.signal.aborted) {
          setOptimizedResult((prev) => prev + result);
        }
      },
      abortController: controller
    });

    setAbortController(null);
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
    <>
      <MyPopover
        Trigger={
          <Flex {...iconButtonStyle}>
            <MyTooltip label={t('app:Optimizer_Tooltip')}>
              <MyIcon name={'optimizer'} w={'1.2rem'} />
            </MyTooltip>
          </Flex>
        }
        trigger="click"
        placement={'auto'}
        w="482px"
        onBackdropClick={() => {
          if (optimizedResult) {
            onOpenConfirm();
          } else {
            closePopoverRef.current?.();
          }
        }}
        onOpenFunc={() => {
          setTimeout(() => {
            InputRef.current?.focus();
          }, 50);
        }}
      >
        {({ onClose }) => {
          closePopoverRef.current = onClose;
          return (
            <Box p={optimizedResult ? 8 : 4}>
              {/* Result */}
              {optimizedResult && (
                <Box
                  px={'10px'}
                  maxHeight={'300px'}
                  overflowY={'auto'}
                  fontSize={'14px'}
                  color={'gray.700'}
                  whiteSpace={'pre-wrap'}
                  wordBreak={'break-word'}
                  mb={4}
                >
                  {optimizedResult}
                </Box>
              )}
              {/* Button */}
              <Flex mb={3} alignItems={'center'} gap={3}>
                {!loading ? (
                  <>
                    {!optimizedResult && !!defaultPrompt && (
                      <Button
                        variant={'whiteBase'}
                        size={'sm'}
                        color={'myGray.600'}
                        onClick={() => handleSendOptimization(true)}
                      >
                        {t('app:AutoOptimize')}
                      </Button>
                    )}
                    {optimizedResult && (
                      <>
                        <Button
                          variant={'primaryGhost'}
                          size={'sm'}
                          px={2}
                          border={'0.5px solid'}
                          color={'primary.600'}
                          onClick={() => {
                            onChangeText?.(optimizedResult);
                            setOptimizedResult('');
                            setOptimizerInput('');
                            onClose();
                          }}
                        >
                          {t('app:Optimizer_Replace')}
                        </Button>
                        <Button
                          variant={'whiteBase'}
                          size={'sm'}
                          fontSize={'12px'}
                          onClick={() => {
                            setOptimizedResult('');
                            handleSendOptimization();
                          }}
                        >
                          {t('app:Optimizer_Reoptimize')}
                        </Button>
                      </>
                    )}

                    <Box flex={1} />
                    {modelOptions && modelOptions.length > 0 && (
                      <AIModelSelector
                        borderColor={'transparent'}
                        _hover={{
                          border: '1px solid',
                          borderColor: 'primary.400'
                        }}
                        size={'sm'}
                        value={selectedModel}
                        list={modelOptions}
                        onChange={setSelectedModel}
                      />
                    )}
                  </>
                ) : (
                  <MyIcon name={'common/ellipsis'} w={6} ml={3} color={'myGray.400'} />
                )}
              </Flex>

              {/* Input */}
              <Flex
                alignItems={'center'}
                gap={2}
                border={'1px solid'}
                borderColor={'gray.200'}
                borderRadius={'md'}
                p={2}
                mb={3}
                _focusWithin={{ borderColor: 'primary.600' }}
              >
                <MyIcon name={'optimizer'} alignSelf={'flex-start'} mt={0.5} w={5} />
                <Textarea
                  ref={InputRef}
                  placeholder={
                    !loading
                      ? t('app:Optimizer_Placeholder')
                      : t('app:Optimizer_Placeholder_loading')
                  }
                  autoFocus
                  resize={'none'}
                  rows={1}
                  minHeight={'24px'}
                  lineHeight={'24px'}
                  maxHeight={'96px'}
                  overflowY={'hidden'}
                  border={'none'}
                  boxShadow={'none !important'}
                  fontSize={'sm'}
                  p={0}
                  borderRadius={'none'}
                  value={optimizerInput}
                  onKeyDown={handleKeyDown}
                  isDisabled={loading}
                  onChange={(e) => {
                    const textarea = e.target;
                    setOptimizerInput(e.target.value);

                    textarea.style.height = '24px';
                    const maxHeight = 96;
                    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
                    textarea.style.height = `${newHeight}px`;

                    if (textarea.scrollHeight > maxHeight) {
                      textarea.style.overflowY = 'auto';
                    } else {
                      textarea.style.overflowY = 'hidden';
                    }
                  }}
                  flex={1}
                />
                <MyIcon
                  name={loading ? 'stop' : 'core/chat/sendLight'}
                  w={'1rem'}
                  alignSelf={'flex-end'}
                  mb={1}
                  color={loading || !isEmptyOptimizerInput ? 'primary.600' : 'gray.400'}
                  cursor={loading || !isEmptyOptimizerInput ? 'pointer' : 'not-allowed'}
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
          );
        }}
      </MyPopover>

      <MyModal
        isOpen={isConfirmOpen}
        onClose={onCloseConfirm}
        title={t('app:Optimizer_CloseConfirm')}
        iconSrc={'common/confirm/deleteTip'}
        size="md"
        zIndex={2000}
      >
        <Box p={4}>
          <Box fontSize={'sm'} color={'myGray.700'} mb={4}>
            {t('app:Optimizer_CloseConfirmText')}
          </Box>
          <Flex justifyContent={'flex-end'} gap={3}>
            <Button variant={'whiteBase'} onClick={onCloseConfirm}>
              {t('common:Cancel')}
            </Button>
            <Button
              variant={'dangerFill'}
              onClick={() => {
                setOptimizedResult('');
                setOptimizerInput('');
                if (abortController) {
                  abortController.abort();
                  setAbortController(null);
                }
                onCloseConfirm();
                closePopoverRef.current?.();
              }}
            >
              {t('app:Optimizer_CloseConfirm')}
            </Button>
          </Flex>
        </Box>
      </MyModal>
    </>
  );
};

export default OptimizerPopover;
