import { useMemo, useRef, useState } from 'react';
import type { FlexProps } from '@chakra-ui/react';
import { Box, Button, Flex, Textarea, useDisclosure } from '@chakra-ui/react';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import Avatar from '../../../../Avatar';
import MyPopover from '../../../../MyPopover';
import MyIcon from '../../../../Icon';
import MySelect from '../../../../MySelect';
import MyModal from '../../../../MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '../../../../../../hooks/useRequest';

export type OnOptimizePromptProps = {
  prompt: string;
  model: string;
  onResult: (result: string) => void;
  abortController?: AbortController;
};

const OptimizerPopover = ({
  onOptimizePrompt,
  onChangeText,
  modelList,
  iconButtonStyle,
  defaultModel
}: {
  onOptimizePrompt: (props: OnOptimizePromptProps) => Promise<void>;
  onChangeText?: (text: string) => void;
  modelList?: Array<{ model: string; name: string; avatar?: string }>;
  iconButtonStyle: FlexProps;
  defaultModel?: string;
}) => {
  const { t } = useTranslation();

  const [optimizerInput, setOptimizerInput] = useState('');
  const [optimizedResult, setOptimizedResult] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModel || modelList?.[0]?.model || '');

  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const { isOpen: isConfirmOpen, onOpen: onOpenConfirm, onClose: onCloseConfirm } = useDisclosure();

  const closePopoverRef = useRef<() => void>();
  const optimizerInputRef = useRef<HTMLTextAreaElement>(null);

  const modelOptions = useMemo(() => {
    return modelList?.map((model) => ({
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
    }));
  }, [modelList]);

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
      prompt: optimizerInput,
      model: selectedModel,
      onResult: (result) => {
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
    if (e.key === 'Enter' && !e.shiftKey) {
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
            <MyIcon name={'optimizer'} w={'18px'} />
          </Flex>
        }
        trigger="click"
        placement={'bottom'}
        w="482px"
        onOpenFunc={() => {
          setTimeout(() => optimizerInputRef.current?.focus(), 50);
        }}
        onBackdropClick={() => {
          if (optimizedResult) {
            onOpenConfirm();
          } else {
            closePopoverRef.current?.();
          }
        }}
      >
        {({ onClose }) => {
          closePopoverRef.current = onClose;
          return (
            <Box p={optimizedResult ? 8 : 4}>
              {(optimizedResult || loading) && (
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
                  {optimizedResult || (loading ? t('app:Optimizer_Generating') : '')}
                </Box>
              )}
              {!optimizedResult && !loading && (
                <Flex mb={3} alignItems={'center'} justifyContent={'space-between'} gap={3}>
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    fontSize={'12px'}
                    color={'myGray.600'}
                    onClick={() => handleSendOptimization(true)}
                  >
                    {t('app:AutoOptimize')}
                  </Button>
                  {modelOptions && modelOptions.length > 0 && (
                    <MySelect<string>
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
                </Flex>
              )}
              {optimizedResult && !loading && (
                <Flex mb={3} gap={3}>
                  <Button
                    variant={'primaryGhost'}
                    size={'sm'}
                    px={2}
                    borderRadius={'10px'}
                    border={'0.5px solid'}
                    borderColor={'primary.200'}
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
                    variant={'outline'}
                    size={'sm'}
                    fontSize={'12px'}
                    onClick={() => {
                      setOptimizedResult('');
                      handleSendOptimization();
                    }}
                  >
                    {t('app:Optimizer_Reoptimize')}
                  </Button>
                </Flex>
              )}

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
                  placeholder={t('app:Optimizer_Placeholder')}
                  resize={'none'}
                  rows={1}
                  minHeight={'24px'}
                  lineHeight={'24px'}
                  maxHeight={'96px'}
                  overflowY={'hidden'}
                  border={'none'}
                  _focus={{
                    boxShadow: 'none'
                  }}
                  fontSize={'sm'}
                  p={0}
                  borderRadius={'none'}
                  value={optimizerInput}
                  ref={optimizerInputRef}
                  onKeyDown={handleKeyDown}
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
                  w={'4'}
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
