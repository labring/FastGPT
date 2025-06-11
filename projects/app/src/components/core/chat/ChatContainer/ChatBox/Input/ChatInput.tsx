import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Spinner, Textarea } from '@chakra-ui/react';
import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { type ChatBoxInputFormType, type ChatBoxInputType, type SendPromptFnType } from '../type';
import { textareaMinH } from '../constants';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { ChatBoxContext } from '../Provider';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import FilePreview from '../../components/FilePreview';
import { useFileUpload } from '../hooks/useFileUpload';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import { useToast } from '@fastgpt/web/hooks/useToast';
import VoiceInput, { type VoiceInputComponentRef } from './VoiceInput';

const InputGuideBox = dynamic(() => import('./InputGuideBox'));

const fileTypeFilter = (file: File) => {
  return (
    file.type.includes('image') ||
    documentFileType.split(',').some((type) => file.name.endsWith(type.trim()))
  );
};

const ChatInput = ({
  onSendMessage,
  onStop,
  TextareaDom,
  resetInputVal,
  chatForm
}: {
  onSendMessage: SendPromptFnType;
  onStop: () => void;
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

  // Check voice input state
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);

  // Poll voice input state
  useEffect(() => {
    const checkVoiceState = () => {
      if (VoiceInputRef.current) {
        const { isSpeaking, isTransCription } = VoiceInputRef.current.getVoiceInputState();
        setIsVoiceInputActive(isSpeaking || isTransCription);
      }
    };

    const interval = setInterval(checkVoiceState, 100); // Check every 100ms
    return () => clearInterval(interval);
  }, []);

  const outLinkAuthData = useContextSelector(ChatBoxContext, (v) => v.outLinkAuthData);
  const appId = useContextSelector(ChatBoxContext, (v) => v.appId);
  const chatId = useContextSelector(ChatBoxContext, (v) => v.chatId);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const whisperConfig = useContextSelector(ChatBoxContext, (v) => v.whisperConfig);
  const chatInputGuide = useContextSelector(ChatBoxContext, (v) => v.chatInputGuide);
  const fileSelectConfig = useContextSelector(ChatBoxContext, (v) => v.fileSelectConfig);

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
  const canSendMessage = havInput && !hasFileUploading;

  // Upload files
  useRequest2(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, outLinkAuthData, chatId]
  });

  /* on send */
  const handleSend = useCallback(
    async (val?: string) => {
      if (!canSendMessage) return;
      const textareaValue = val || TextareaDom.current?.value || '';

      onSendMessage({
        text: textareaValue.trim(),
        files: fileList
      });
      replaceFiles([]);
    },
    [TextareaDom, canSendMessage, fileList, onSendMessage, replaceFiles]
  );

  const RenderTextarea = useMemo(
    () => (
      <Flex alignItems={'center'} mt={fileList.length > 0 ? 1 : 0} pl={[2, 4]}>
        {/* file selector */}

        {/* Prompt Container */}
        <Textarea
          ref={TextareaDom}
          py={0}
          display={'inline-flex'}
          pl={2}
          pr={['30px', '48px']}
          border={'none'}
          _focusVisible={{
            border: 'none'
          }}
          placeholder={
            isPc ? t('common:core.chat.Type a message') : t('chat:input_placeholder_phone')
          }
          resize={'none'}
          rows={1}
          height={6}
          lineHeight={6}
          maxHeight={'50vh'}
          mb={isVoiceInputActive && !isPc ? 2 : 8}
          maxLength={-1}
          overflowY={'hidden'}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-all'}
          boxShadow={'none !important'}
          color={'myGray.900'}
          fontWeight={400}
          fontSize={'16px'}
          letterSpacing={'0.5px'}
          _placeholder={{
            color: '#A4A4A4',
            fontSize: '14px'
          }}
          value={inputValue}
          onChange={(e) => {
            const textarea = e.target;
            textarea.style.height = textareaMinH;
            const maxViewportHeight = window.innerHeight * 0.5; // Restore original 50vh
            const newHeight = Math.min(textarea.scrollHeight, maxViewportHeight);
            textarea.style.height = `${newHeight}px`;

            // Only show scrollbar when content exceeds max height
            if (textarea.scrollHeight > maxViewportHeight) {
              textarea.style.overflowY = 'auto';
            } else {
              textarea.style.overflowY = 'hidden';
            }

            setValue('input', textarea.value);
          }}
          onKeyDown={(e) => {
            // enter send.(pc or iframe && enter and unPress shift)
            const isEnter = e.key === 'Enter';
            if (isEnter && TextareaDom.current && (e.ctrlKey || e.altKey)) {
              // Add a new line
              const index = TextareaDom.current.selectionStart;
              const val = TextareaDom.current.value;
              TextareaDom.current.value = `${val.slice(0, index)}\n${val.slice(index)}`;
              TextareaDom.current.selectionStart = index + 1;
              TextareaDom.current.selectionEnd = index + 1;

              TextareaDom.current.style.height = textareaMinH;
              TextareaDom.current.style.height = `${TextareaDom.current.scrollHeight}px`;

              return;
            }

            // Select all content
            // @ts-ignore
            e.key === 'a' && e.ctrlKey && e.target?.select();

            if ((isPc || window !== parent) && e.keyCode === 13 && !e.shiftKey) {
              handleSend();
              e.preventDefault();
            }
          }}
          onPaste={(e) => {
            const clipboardData = e.clipboardData;
            if (clipboardData && (showSelectFile || showSelectImg)) {
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
        />
        {/* Button Group */}
        {!isVoiceInputActive && (
          <Flex
            alignItems={'center'}
            position={'absolute'}
            right={4}
            bottom={3.5}
            w={'134px'}
            h={9}
            gap={2}
            zIndex={3}
          >
            {/* Attachment and Voice Group */}
            <Flex alignItems={'center'} gap={2} w={'74px'} h={9} flex={'none'} order={0}>
              {/* file selector button */}
              {(showSelectFile || showSelectImg) && (
                <Flex
                  alignItems={'center'}
                  justifyContent={'center'}
                  w={9}
                  h={9}
                  p={2}
                  borderRadius={'sm'}
                  cursor={'pointer'}
                  flex={'none'}
                  order={0}
                  _hover={{ bg: 'rgba(0, 0, 0, 0.04)' }}
                  onClick={() => {
                    onOpenSelectFile();
                  }}
                >
                  <MyTooltip label={selectFileLabel}>
                    <MyIcon name={selectFileIcon as any} w={5} h={5} color={'#707070'} />
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
                  p={2}
                  borderRadius={'sm'}
                  cursor={'pointer'}
                  flex={'none'}
                  order={1}
                  _hover={{ bg: 'rgba(0, 0, 0, 0.04)' }}
                  onClick={() => {
                    VoiceInputRef.current?.onSpeak?.();
                  }}
                >
                  <MyTooltip label={t('common:core.chat.Record')}>
                    <MyIcon name={'core/chat/recordFill'} w={5} h={5} color={'#707070'} />
                  </MyTooltip>
                </Flex>
              )}
            </Flex>

            {/* Divider Container */}
            <Flex alignItems={'center'} pr={2} w={'8px'} h={4} flex={'none'} order={1}>
              <Box
                w={1}
                h={'2px'}
                bg={'myGray.150'}
                transform={'rotate(90deg)'}
                flex={'none'}
                order={0}
              />
            </Flex>

            {/* Send Button Container */}
            <Flex alignItems={'center'} w={9} h={9} borderRadius={'lg'} flex={'none'} order={2}>
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={9}
                h={9}
                p={2}
                bg={
                  isChatting
                    ? 'rgba(17, 24, 36, 0.1)'
                    : !havInput || hasFileUploading
                      ? 'rgba(17, 24, 36, 0.1)'
                      : 'primary.500'
                }
                borderRadius="lg"
                cursor={havInput ? 'pointer' : 'not-allowed'}
                flex={'none'}
                order={0}
                onClick={() => {
                  if (isChatting) {
                    return onStop();
                  }
                  return handleSend();
                }}
              >
                {isChatting ? (
                  <MyIcon
                    animation={'zoomStopIcon 0.4s infinite alternate'}
                    w={5}
                    h={5}
                    cursor={'pointer'}
                    name={'stop'}
                    color={'white'}
                  />
                ) : (
                  <MyTooltip label={t('common:core.chat.Send Message')}>
                    <MyIcon name={'core/chat/sendFill'} w={5} h={5} color={'white'} />
                  </MyTooltip>
                )}
              </Flex>
            </Flex>
          </Flex>
        )}
      </Flex>
    ),
    [
      File,
      TextareaDom,
      fileList.length,
      handleSend,
      hasFileUploading,
      havInput,
      inputValue,
      isChatting,
      isPc,
      isVoiceInputActive,
      onOpenSelectFile,
      onSelectFile,
      onStop,
      selectFileIcon,
      selectFileLabel,
      setValue,
      showSelectFile,
      showSelectImg,
      t,
      whisperConfig?.open
    ]
  );

  return (
    <Box
      m={['0 auto', '10px auto']}
      w={'100%'}
      maxW={['auto', 'min(820px, 100%)']}
      px={[4, 5]}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();

        if (!(showSelectFile || showSelectImg)) return;
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
      <Box
        minH={isVoiceInputActive && !isPc ? 12 : 32}
        pt={fileList.length > 0 ? '0' : isVoiceInputActive && !isPc ? [0, 5] : [3.5, 5]}
        pb={isVoiceInputActive && !isPc ? [0, 5] : [3.5, 5]}
        position={'relative'}
        boxShadow={`0px 5px 16px -4px rgba(19, 51, 107, 0.08)`}
        borderRadius={'xxl'}
        bg={'white'}
        overflow={'display'}
        border={'0.5px solid rgba(0, 0, 0, 0.13)'}
        borderColor={'rgba(0,0,0,0.12)'}
      >
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
        <Box px={[1, 3]}>
          <FilePreview fileList={fileList} removeFiles={removeFiles} />
        </Box>

        {/* voice input and loading container */}
        {!inputValue && (
          <VoiceInput
            ref={VoiceInputRef}
            onSendMessage={onSendMessage}
            resetInputVal={resetInputVal}
          />
        )}

        {RenderTextarea}
      </Box>
      <ComplianceTip type={'chat'} />
    </Box>
  );
};

export default React.memo(ChatInput);
