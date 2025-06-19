import type { FlexProps } from '@chakra-ui/react';
import { Box, Flex, Textarea, useBoolean } from '@chakra-ui/react';
import React, { useRef, useCallback, useMemo, useState } from 'react';
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

  const [focusing, { on: onFocus, off: offFocus }] = useBoolean();

  // Check voice input state
  const [mobilePreSpeak, setMobilePreSpeak] = useState(false);

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
      <Flex direction={'column'} mt={fileList.length > 0 ? 1 : 0}>
        {/* Textarea */}
        <Flex w={'100%'}>
          {/* Prompt Container */}
          <Textarea
            ref={TextareaDom}
            py={0}
            mx={[2, 4]}
            px={2}
            border={'none'}
            _focusVisible={{
              border: 'none'
            }}
            placeholder={
              isPc ? t('common:core.chat.Type a message') : t('chat:input_placeholder_phone')
            }
            resize={'none'}
            rows={1}
            height={[5, 6]}
            lineHeight={[5, 6]}
            maxHeight={[24, 32]}
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
              color: '#707070',
              fontSize: 'sm'
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
            onFocus={onFocus}
            onBlur={offFocus}
          />
        </Flex>
      </Flex>
    ),
    [
      TextareaDom,
      fileList.length,
      handleSend,
      inputValue,
      isPc,
      onSelectFile,
      setValue,
      showSelectFile,
      showSelectImg,
      t
    ]
  );

  const RenderButtonGroup = useMemo(() => {
    const iconSize = {
      w: isPc ? '20px' : '16px',
      h: isPc ? '20px' : '16px'
    };

    return (
      <Flex
        alignItems={'center'}
        justifyContent={'flex-end'}
        w={'100%'}
        mt={0}
        pr={[3, 4]}
        h={[8, 9]}
        gap={[0, 1]}
      >
        {/* Attachment and Voice Group */}
        <Flex alignItems={'center'} h={[8, 9]}>
          {/* file selector button */}
          {(showSelectFile || showSelectImg) && (
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              w={[8, 9]}
              h={[8, 9]}
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
                <MyIcon name={selectFileIcon as any} {...iconSize} color={'#707070'} />
              </MyTooltip>
              <File onSelect={(files) => onSelectFile({ files })} />
            </Flex>
          )}

          {/* Voice input button */}
          {whisperConfig?.open && !inputValue && (
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              w={[8, 9]}
              h={[8, 9]}
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
                <MyIcon name={'core/chat/recordFill'} {...iconSize} color={'#707070'} />
              </MyTooltip>
            </Flex>
          )}
        </Flex>

        {/* Divider Container */}
        {((whisperConfig?.open && !inputValue) || showSelectFile || showSelectImg) && (
          <Flex alignItems={'center'} justifyContent={'center'} w={2} h={4} mr={2}>
            <Box w={'2px'} h={5} bg={'myGray.200'} />
          </Flex>
        )}

        {/* Send Button Container */}
        <Flex alignItems={'center'} w={[8, 9]} h={[8, 9]} borderRadius={'lg'}>
          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            w={[7, 9]}
            h={[7, 9]}
            p={[1, 2]}
            bg={
              isChatting ? 'primary.50' : canSendMessage ? 'primary.500' : 'rgba(17, 24, 36, 0.1)'
            }
            borderRadius={['md', 'lg']}
            cursor={isChatting ? 'pointer' : canSendMessage ? 'pointer' : 'not-allowed'}
            onClick={(e) => {
              e.stopPropagation();
              if (isChatting) {
                return onStop();
              }
              return handleSend();
            }}
          >
            {isChatting ? (
              <MyIcon {...iconSize} name={'stop'} color={'primary.600'} />
            ) : (
              <MyTooltip label={t('common:core.chat.Send Message')}>
                <MyIcon name={'core/chat/sendFill'} {...iconSize} color={'white'} />
              </MyTooltip>
            )}
          </Flex>
        </Flex>
      </Flex>
    );
  }, [
    isPc,
    showSelectFile,
    showSelectImg,
    selectFileLabel,
    selectFileIcon,
    File,
    whisperConfig?.open,
    inputValue,
    t,
    isChatting,
    canSendMessage,
    onOpenSelectFile,
    onSelectFile,
    handleSend,
    onStop
  ]);

  const activeStyles: FlexProps = {
    boxShadow: '0px 5px 20px -4px rgba(19, 51, 107, 0.13)',
    border: '0.5px solid rgba(0, 0, 0, 0.24)'
  };

  return (
    <Box
      m={['0 auto 10px', '10px auto']}
      w={'100%'}
      maxW={['auto', 'min(820px, 100%)']}
      px={[3, 5]}
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
      <Flex
        direction={'column'}
        minH={mobilePreSpeak ? '48px' : ['96px', '120px']}
        pt={fileList.length > 0 ? '0' : mobilePreSpeak ? [0, 4] : [3, 4]}
        pb={[2, 4]}
        position={'relative'}
        borderRadius={['xl', 'xxl']}
        bg={'white'}
        overflow={'display'}
        {...(focusing
          ? activeStyles
          : {
              _hover: activeStyles,
              border: '0.5px solid rgba(0, 0, 0, 0.18)',
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
            <Box px={[2, 3]}>
              <FilePreview fileList={fileList} removeFiles={removeFiles} />
            </Box>
          )}

          {/* loading spinner */}

          {/* voice input and loading container */}
          {!inputValue && (
            <VoiceInput
              ref={VoiceInputRef}
              handleSend={(text) => {
                onSendMessage({
                  text: text.trim(),
                  files: fileList
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
      <ComplianceTip type={'chat'} />
    </Box>
  );
};

export default React.memo(ChatInput);
