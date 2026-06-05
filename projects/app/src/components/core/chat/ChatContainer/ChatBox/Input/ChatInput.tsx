import type { FlexProps } from '@chakra-ui/react';
import { Box, Flex, Textarea, useBoolean } from '@chakra-ui/react';
import React, { useRef, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  type ChatBoxInputFormType,
  type ChatBoxInputType,
  type SendPromptFnType,
  type StopChatFnResult
} from '../type';
import { ChatInputDefaultHeight, textareaMinH } from '../constants';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { ChatBoxContext } from '../Provider';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import FilePreview from '../../components/FilePreview';
import { useFileUpload } from '../hooks/useFileUpload';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import { useToast } from '@fastgpt/web/hooks/useToast';
import VoiceInput, { type VoiceInputComponentRef } from './VoiceInput';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

const InputGuideBox = dynamic(() => import('./InputGuideBox'));

const fileTypeFilter = (file: File) => {
  return (
    file.type.includes('image') ||
    documentFileType.split(',').some((type) => file.name.endsWith(type.trim()))
  );
};

const ChatInput = ({
  lastInteractive,
  onSendMessage,
  onStop,
  onStopChat,
  onStopSettled,
  disableSend,
  TextareaDom,
  resetInputVal,
  chatForm
}: {
  lastInteractive?: WorkflowInteractiveResponseType;
  onSendMessage: SendPromptFnType;
  onStop: () => void;
  onStopChat: () => Promise<StopChatFnResult>;
  onStopSettled?: (status: ChatGenerateStatusEnum, completed: boolean) => void;
  disableSend?: boolean;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
  resetInputVal: (val: ChatBoxInputType) => void;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPc } = useSystem();
  const VoiceInputRef = useRef<VoiceInputComponentRef>(null);

  const { setValue, watch, control } = chatForm;
  const inputValue = watch('input');

  const [focusing, { on: onFocus, off: offFocus }] = useBoolean();

  // Check voice input state
  const [mobilePreSpeak, setMobilePreSpeak] = useState(false);

  const InputLeftComponent = useContextSelector(ChatBoxContext, (v) => v.InputLeftComponent);

  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const whisperConfig = useContextSelector(ChatBoxContext, (v) => v.whisperConfig);
  const chatInputGuide = useContextSelector(ChatBoxContext, (v) => v.chatInputGuide);
  const fileSelectConfig = useContextSelector(ChatBoxContext, (v) => v.fileSelectConfig);
  const dialogTips = useContextSelector(ChatBoxContext, (v) => v.dialogTips);
  const autoTTSResponse = useContextSelector(ChatBoxContext, (v) => v.autoTTSResponse);

  const fileCtrl = useFieldArray({
    control,
    name: 'files'
  });
  const {
    File,
    onOpenSelectFile,
    fileList,
    onSelectFile,
    uploadFiles,
    selectFileIcon,
    selectFileLabel,
    showSelectFile,
    showSelectImg,
    showSelectVideo,
    showSelectAudio,
    showSelectCustomFileExtension,
    removeFiles,
    replaceFiles,
    hasFileUploading
  } = useFileUpload({
    fileSelectConfig,
    fileCtrl,
    outLinkAuthData,
    appId,
    chatId
  });
  const havInput = !!inputValue || fileList.length > 0;
  const canSendMessage = havInput && !hasFileUploading && !disableSend;
  const canUploadFile =
    showSelectFile ||
    showSelectImg ||
    showSelectVideo ||
    showSelectAudio ||
    showSelectCustomFileExtension;
  const isDefaultInputHeight =
    !mobilePreSpeak && !inputValue && fileList.length === 0 && !chatInputGuide.open;

  // Upload files
  useRequest(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, outLinkAuthData, chatId]
  });

  /* on send */
  const handleSend = useCallback(
    async (val: string = inputValue) => {
      if (!canSendMessage) return;

      onSendMessage({
        text: val.trim(),
        files: fileList,
        interactive: lastInteractive
      });
      replaceFiles([]);
    },
    [inputValue, lastInteractive, canSendMessage, fileList, onSendMessage, replaceFiles]
  );
  const { runAsync: handleStop, loading: isStopping } = useRequest(async () => {
    try {
      if (isChatting) {
        const result = await onStopChat();
        onStopSettled?.(result.chatGenerateStatus, result.completed);
      }
    } catch {
      onStopSettled?.(ChatGenerateStatusEnum.generating, false);
    } finally {
      onStop();
    }
  });

  const RenderTextarea = useMemo(
    () => (
      <Flex direction={'column'} mt={fileList.length > 0 ? 1 : 0}>
        {/* Textarea */}
        <Flex w={'100%'}>
          {/* Prompt Container */}
          <Textarea
            ref={TextareaDom}
            py={0}
            mx={0}
            px={0}
            border={'none'}
            borderRadius={0}
            appearance={'none'}
            _focusVisible={{
              border: 'none'
            }}
            placeholder={
              dialogTips ||
              (isPc ? t('common:core.chat.Type a message') : t('chat:input_placeholder_phone'))
            }
            resize={'none'}
            rows={1}
            height={[5, 6]}
            lineHeight={[5, 6]}
            maxHeight={[24, 32]}
            minH={'50px'}
            mb={0}
            maxLength={-1}
            overflowY={'hidden'}
            overflowX={'hidden'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-word'}
            boxShadow={'none !important'}
            color={'myGray.900'}
            fontWeight={400}
            fontSize={'1rem'}
            letterSpacing={'0.5px'}
            w={'100%'}
            _placeholder={{
              color: 'myGray.400',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              letterSpacing: 'inherit'
            }}
            value={inputValue}
            onChange={(e) => {
              const textarea = e.target;
              textarea.style.height = textareaMinH;
              const maxHeight = 128;
              const newHeight = Math.min(textarea.scrollHeight, maxHeight);
              textarea.style.height = `${newHeight}px`;

              // Only show scrollbar when content exceeds max height
              if (textarea.scrollHeight > maxHeight) {
                textarea.style.overflowY = 'auto';
              } else {
                textarea.style.overflowY = 'hidden';
              }

              setValue('input', textarea.value);
            }}
            onKeyDown={(e) => {
              // enter send.(pc or iframe && enter and unPress shift)
              const isEnter = e.key === 'Enter';
              const textarea = e.currentTarget;
              if (isEnter && (e.ctrlKey || e.altKey)) {
                // Add a new line
                const index = textarea.selectionStart;
                const val = textarea.value;
                textarea.value = `${val.slice(0, index)}\n${val.slice(index)}`;
                textarea.selectionStart = index + 1;
                textarea.selectionEnd = index + 1;

                textarea.style.height = textareaMinH;
                textarea.style.height = `${textarea.scrollHeight}px`;

                return;
              }

              // Select all content
              if (e.key === 'a' && e.ctrlKey) {
                textarea.select();
              }

              if ((isPc || window !== parent) && e.keyCode === 13 && !e.shiftKey) {
                handleSend(textarea.value);
                e.preventDefault();
              }
            }}
            onPaste={(e) => {
              const clipboardData = e.clipboardData;
              if (clipboardData && canUploadFile) {
                const items = clipboardData.items;
                const files = Array.from(items)
                  .map((item) => (item.kind === 'file' ? item.getAsFile() : undefined))
                  .filter((file) => {
                    return file && fileTypeFilter(file);
                  }) as File[];
                onSelectFile({ files });

                if (files.length > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }
            }}
            onFocus={onFocus}
            onBlur={offFocus}
          />
        </Flex>
      </Flex>
    ),
    [
      fileList.length,
      TextareaDom,
      dialogTips,
      isPc,
      t,
      inputValue,
      onFocus,
      offFocus,
      setValue,
      handleSend,
      canUploadFile,
      onSelectFile
    ]
  );

  const RenderButtonGroup = useMemo(() => {
    const iconSize = {
      w: '20px',
      h: '20px'
    };

    return (
      <Flex
        alignItems={'flex-start'}
        justifyContent={'space-between'}
        w={'100%'}
        mt={0}
        h={9}
        gap={[0, 1]}
      >
        {/* 左侧自定义按钮组 */}
        <Flex alignItems={'center'} gap={2} flex={'1 0 0'} w={0}>
          {InputLeftComponent}
        </Flex>

        {/* 右侧原有按钮组 */}
        <Flex alignItems={'center'} gap={[0, 1]}>
          {/* Attachment and Voice Group */}
          <Flex alignItems={'center'} h={9}>
            {/* file selector button */}
            {canUploadFile && (
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={9}
                h={9}
                p={[1, 2]}
                borderRadius={'sm'}
                cursor={'pointer'}
                _hover={{ bg: 'rgba(0, 0, 0, 0.04)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSelectFile();
                }}
              >
                <MyTooltip label={selectFileLabel}>
                  <MyIcon name={selectFileIcon as any} {...iconSize} color={'myGray.500'} />
                </MyTooltip>
                <File onSelect={(files) => onSelectFile({ files })} />
              </Flex>
            )}

            {/* Voice input button */}
            {whisperConfig?.open && !inputValue && (
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={9}
                h={9}
                p={[1, 2]}
                borderRadius={'sm'}
                cursor={'pointer'}
                _hover={{ bg: 'rgba(0, 0, 0, 0.04)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  VoiceInputRef.current?.onSpeak?.();
                }}
              >
                <MyTooltip label={t('common:core.chat.Record')}>
                  <MyIcon name={'core/chat/recordFill'} {...iconSize} color={'myGray.500'} />
                </MyTooltip>
              </Flex>
            )}
          </Flex>

          {/* Divider Container */}
          {((whisperConfig?.open && !inputValue) || canUploadFile) && (
            <Flex alignItems={'center'} justifyContent={'center'} w={2} h={4} mr={2}>
              <Box w={'2px'} h={5} bg={'myGray.200'} />
            </Flex>
          )}

          {/* Send Button Container */}
          <Flex alignItems={'center'} w={9} h={9} borderRadius={'lg'}>
            <MyBox
              isLoading={isStopping}
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              w={9}
              h={9}
              p={[1, 2]}
              bg={
                isChatting ? 'primary.50' : canSendMessage ? 'primary.500' : 'rgba(17, 24, 36, 0.1)'
              }
              borderRadius={['md', 'lg']}
              cursor={isChatting ? 'pointer' : canSendMessage ? 'pointer' : 'not-allowed'}
              onClick={(e) => {
                e.stopPropagation();
                if (isChatting) {
                  void handleStop();
                  return;
                }
                return void handleSend(inputValue);
              }}
            >
              {isChatting ? (
                <MyIcon {...iconSize} name={'stop'} color={'primary.600'} />
              ) : (
                <MyTooltip label={t('common:core.chat.Send Message')}>
                  <MyIcon name={'core/chat/sendFill'} {...iconSize} color={'white'} />
                </MyTooltip>
              )}
            </MyBox>
          </Flex>
        </Flex>
      </Flex>
    );
  }, [
    isPc,
    InputLeftComponent,
    canUploadFile,
    selectFileLabel,
    selectFileIcon,
    File,
    whisperConfig?.open,
    inputValue,
    t,
    isStopping,
    isChatting,
    canSendMessage,
    disableSend,
    onOpenSelectFile,
    onSelectFile,
    handleSend,
    handleStop,
    onStopChat,
    onStopSettled
  ]);

  const activeStyles: FlexProps = {
    boxShadow: '0px 5px 20px -4px rgba(19, 51, 107, 0.13)',
    border: '1px solid',
    borderColor: 'myGray.250'
  };

  return (
    <Box
      w={'100%'}
      maxW={['100%', '780px']}
      mx={'auto'}
      pb={['calc(12px + env(safe-area-inset-bottom))', 0]}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();

        if (!canUploadFile) return;
        const files = Array.from(e.dataTransfer.files);

        const droppedFiles = files.filter((file) => fileTypeFilter(file));
        if (droppedFiles.length > 0) {
          onSelectFile({ files: droppedFiles });
        }

        const invalidFileName = files
          .filter((file) => !fileTypeFilter(file))
          .map((file) => file.name)
          .join(', ');
        if (invalidFileName) {
          toast({
            status: 'warning',
            title: t('chat:unsupported_file_type'),
            description: invalidFileName
          });
        }
      }}
    >
      {/* Real Chat Input */}
      <Flex
        direction={'column'}
        h={isDefaultInputHeight ? ChatInputDefaultHeight : undefined}
        minH={mobilePreSpeak ? '48px' : ChatInputDefaultHeight}
        p={mobilePreSpeak ? [0, 4] : 4}
        mb={4}
        position={'relative'}
        borderRadius={['xl', 'xxl']}
        bg={'white'}
        overflow={'display'}
        {...(focusing
          ? activeStyles
          : {
              _hover: activeStyles,
              border: '1px solid',
              borderColor: 'myGray.200',
              boxShadow: `0px 5px 16px -4px rgba(19, 51, 107, 0.08)`
            })}
        onClick={() => TextareaDom?.current?.focus()}
      >
        <Box flex={1}>
          {/* Chat input guide box */}
          {chatInputGuide.open && (
            <InputGuideBox
              appId={appId}
              text={inputValue}
              onSelect={(e) => {
                setValue('input', e);
              }}
              onSend={(e) => {
                handleSend(e);
              }}
            />
          )}
          {/* file preview */}
          {(!mobilePreSpeak || isPc || inputValue) && (
            <Box>
              <FilePreview fileList={fileList} removeFiles={removeFiles} pt={0} />
            </Box>
          )}

          {/* voice input and loading container */}
          {!inputValue && (
            <VoiceInput
              ref={VoiceInputRef}
              handleSend={(text) => {
                onSendMessage({
                  text: text.trim(),
                  files: fileList,
                  autoTTSResponse
                });
                replaceFiles([]);
              }}
              resetInputVal={(val) => {
                setMobilePreSpeak(false);
                resetInputVal({
                  text: val,
                  files: fileList
                });
              }}
              mobilePreSpeak={mobilePreSpeak}
              setMobilePreSpeak={setMobilePreSpeak}
            />
          )}

          {RenderTextarea}
        </Box>

        {!mobilePreSpeak && <Box>{RenderButtonGroup}</Box>}
      </Flex>
      <ComplianceTip type={'chat'} pt={0} pb={[0, 6]} />
    </Box>
  );
};

export default React.memo(ChatInput);
