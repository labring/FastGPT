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
      <Flex alignItems={'flex-end'} mt={fileList.length > 0 ? 1 : 0} pl={[2, 4]}>
        {/* file selector */}
        {(showSelectFile || showSelectImg) && (
          <Flex
            h={'22px'}
            alignItems={'center'}
            justifyContent={'center'}
            cursor={'pointer'}
            transform={'translateY(1px)'}
            onClick={() => {
              onOpenSelectFile();
            }}
          >
            <MyTooltip label={selectFileLabel}>
              <MyIcon name={selectFileIcon as any} w={'18px'} color={'myGray.600'} />
            </MyTooltip>
            <File onSelect={(files) => onSelectFile({ files })} />
          </Flex>
        )}
        {/* input area */}
        <Textarea
          ref={TextareaDom}
          py={0}
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
          height={'22px'}
          lineHeight={'22px'}
          maxHeight={'50vh'}
          maxLength={-1}
          overflowY={'auto'}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-all'}
          boxShadow={'none !important'}
          color={'myGray.900'}
          fontSize={['md', 'sm']}
          value={inputValue}
          onChange={(e) => {
            const textarea = e.target;
            textarea.style.height = textareaMinH;
            textarea.style.height = `${textarea.scrollHeight}px`;
            setValue('input', textarea.value);
          }}
          onKeyDown={(e) => {
            // enter send.(pc or iframe && enter and unPress shift)
            const isEnter = e.keyCode === 13;
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

            // 全选内容
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
        <Flex
          alignItems={'center'}
          position={'absolute'}
          right={[2, 4]}
          bottom={['10px', '12px']}
          zIndex={3}
        >
          {/* Voice input icon */}
          {whisperConfig?.open && !inputValue && (
            <MyTooltip label={t('common:core.chat.Record')}>
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                flexShrink={0}
                h={['28px', '32px']}
                w={['28px', '32px']}
                mr={2}
                borderRadius={'md'}
                cursor={'pointer'}
                _hover={{ bg: '#F5F5F8' }}
                onClick={() => {
                  VoiceInputRef.current?.onSpeak?.();
                }}
              >
                <MyIcon
                  name={'core/chat/recordFill'}
                  width={['22px', '25px']}
                  height={['22px', '25px']}
                  color={'myGray.600'}
                />
              </Flex>
            </MyTooltip>
          )}

          {/* send and stop icon */}
          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            flexShrink={0}
            h={['28px', '32px']}
            w={['28px', '32px']}
            borderRadius={'md'}
            bg={isChatting ? '' : !havInput || hasFileUploading ? '#E5E5E5' : 'primary.500'}
            cursor={havInput ? 'pointer' : 'not-allowed'}
            lineHeight={1}
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
                width={['22px', '25px']}
                height={['22px', '25px']}
                cursor={'pointer'}
                name={'stop'}
                color={'gray.500'}
              />
            ) : (
              <MyTooltip label={t('common:core.chat.Send Message')}>
                <MyIcon
                  name={'core/chat/sendFill'}
                  width={['18px', '20px']}
                  height={['18px', '20px']}
                  color={'white'}
                />
              </MyTooltip>
            )}
          </Flex>
        </Flex>
      </Flex>
    ),
    [
      File,
      TextareaDom,
      fileList,
      handleSend,
      hasFileUploading,
      havInput,
      inputValue,
      isChatting,
      isPc,
      onOpenSelectFile,
      onSelectFile,
      onStop,
      selectFileIcon,
      selectFileLabel,
      setValue,
      showSelectFile,
      showSelectImg,
      t
    ]
  );

  return (
    <Box
      m={['0 auto', '10px auto']}
      w={'100%'}
      maxW={['auto', 'min(800px, 100%)']}
      px={[0, 5]}
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
      <Box
        pt={fileList.length > 0 ? '0' : ['14px', '18px']}
        pb={['14px', '18px']}
        position={'relative'}
        boxShadow={`0 0 10px rgba(0,0,0,0.2)`}
        borderRadius={['none', 'md']}
        bg={'white'}
        overflow={'display'}
        {...(isPc
          ? {
              border: '1px solid',
              borderColor: 'rgba(0,0,0,0.12)'
            }
          : {
              borderTop: '1px solid',
              borderTopColor: 'rgba(0,0,0,0.15)'
            })}
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
