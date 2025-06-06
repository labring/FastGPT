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
          height={'22px'}
          lineHeight={'24px'}
          maxHeight={'50vh'}
          maxLength={-1}
          overflowY={'auto'}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-all'}
          boxShadow={'none !important'}
          color={'myGray.900'}
          fontFamily={'PingFang SC'}
          fontStyle={'normal'}
          fontWeight={400}
          fontSize={'16px'}
          letterSpacing={'0.5px'}
          _placeholder={{
            color: '#A4A4A4',
            fontFamily: 'PingFang SC',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '16px',
            lineHeight: '24px',
            letterSpacing: '0.5px'
          }}
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
        {/* Button Group */}
        <Flex
          alignItems={'center'}
          position={'absolute'}
          right={'16px'}
          bottom={'14px'}
          w={'134px'}
          h={'36px'}
          gap={'8px'}
          zIndex={3}
        >
          {/* Attachment and Voice Group */}
          <Flex alignItems={'center'} gap={'2px'} w={'74px'} h={'36px'} flex={'none'} order={0}>
            {/* file selector button */}
            {(showSelectFile || showSelectImg) && (
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={'36px'}
                h={'36px'}
                p={'8px'}
                borderRadius={'6px'}
                cursor={'pointer'}
                flex={'none'}
                order={0}
                _hover={{ bg: 'rgba(0, 0, 0, 0.04)' }}
                onClick={() => {
                  onOpenSelectFile();
                }}
              >
                <MyTooltip label={selectFileLabel}>
                  <MyIcon name={selectFileIcon as any} w={'20px'} h={'20px'} color={'#707070'} />
                </MyTooltip>
                <File onSelect={(files) => onSelectFile({ files })} />
              </Flex>
            )}

            {/* Voice input button */}
            {whisperConfig?.open && !inputValue && (
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={'36px'}
                h={'36px'}
                p={'8px'}
                borderRadius={'12px'}
                cursor={'pointer'}
                flex={'none'}
                order={1}
                _hover={{ bg: 'rgba(0, 0, 0, 0.04)' }}
                onClick={() => {
                  VoiceInputRef.current?.onSpeak?.();
                }}
              >
                <MyTooltip label={t('common:core.chat.Record')}>
                  <MyIcon name={'core/chat/recordFill'} w={'20px'} h={'20px'} color={'#707070'} />
                </MyTooltip>
              </Flex>
            )}
          </Flex>

          {/* Divider Container */}
          <Flex alignItems={'center'} pr={'8px'} w={'8px'} h={'16px'} flex={'none'} order={1}>
            <Box
              w={'16px'}
              h={'2px'}
              bg={'#F0F1F6'}
              transform={'rotate(90deg)'}
              flex={'none'}
              order={0}
            />
          </Flex>

          {/* Send Button Container */}
          <Flex
            alignItems={'center'}
            w={'36px'}
            h={'36px'}
            borderRadius={'12px'}
            flex={'none'}
            order={2}
          >
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              w={'36px'}
              h={'36px'}
              p={'8px'}
              bg={
                isChatting
                  ? 'rgba(17, 24, 36, 0.1)'
                  : !havInput || hasFileUploading
                    ? 'rgba(17, 24, 36, 0.1)'
                    : 'primary.500'
              }
              borderRadius={'12px'}
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
                  w={'20px'}
                  h={'20px'}
                  cursor={'pointer'}
                  name={'stop'}
                  color={'white'}
                />
              ) : (
                <MyTooltip label={t('common:core.chat.Send Message')}>
                  <MyIcon name={'core/chat/sendFill'} w={'20px'} h={'20px'} color={'white'} />
                </MyTooltip>
              )}
            </Flex>
          </Flex>
        </Flex>
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
        minH={['132px', '150px']}
        pt={fileList.length > 0 ? '0' : ['14px', '18px']}
        pb={['14px', '18px']}
        position={'relative'}
        boxShadow={`0px 5px 16px -4px rgba(19, 51, 107, 0.08)`}
        borderRadius={'20px'}
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
