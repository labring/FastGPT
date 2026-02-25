import type { FlexProps } from '@chakra-ui/react';
import { Box, Flex, Textarea, useBoolean } from '@chakra-ui/react';
import React, { useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  type ChatBoxInputFormType,
  type ChatBoxInputType,
  type SendPromptFnType
} from '../ChatContainer/ChatBox/type';
import { textareaMinH } from '../ChatContainer/ChatBox/constants';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { ChatBoxContext } from '../ChatContainer/ChatBox/Provider';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../ChatContainer/context/workflowRuntimeContext';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import FilePreview from '../ChatContainer/components/FilePreview';
import { useFileUpload } from './hooks/useFileUpload';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { HelperBotContext } from './context';
import type { onSendMessageFnType } from './type';

const fileTypeFilter = (file: File) => {
  return (
    file.type.includes('image') ||
    documentFileType.split(',').some((type) => file.name.endsWith(type.trim()))
  );
};

const ChatInput = ({
  chatId,
  onSendMessage,
  onStop,
  TextareaDom,
  chatForm,
  isChatting
}: {
  chatId: string;
  onSendMessage: onSendMessageFnType;
  onStop: () => void;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  isChatting: boolean;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPc } = useSystem();

  const { setValue, watch, control } = chatForm;
  const inputValue = watch('input');

  const type = useContextSelector(HelperBotContext, (v) => v.type);
  const fileSelectConfig = useContextSelector(HelperBotContext, (v) => v.fileSelectConfig);

  const [focusing, { on: onFocus, off: offFocus }] = useBoolean();

  const fileCtrl = useFieldArray({
    control,
    name: 'files'
  });
  const {
    File,
    onOpenSelectFile,
    fileList,
    onSelectFile,
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
    type,
    chatId
  });
  const havInput = !!inputValue || fileList.length > 0;
  const canSendMessage = havInput && !hasFileUploading;
  const canUploadFile =
    showSelectFile ||
    showSelectImg ||
    showSelectVideo ||
    showSelectAudio ||
    showSelectCustomFileExtension;

  /* on send */
  const handleSend = useCallback(
    async (val?: string) => {
      if (!canSendMessage) return;
      const textareaValue = val || TextareaDom.current?.value || '';

      onSendMessage({
        query: textareaValue.trim(),
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
      w: isPc ? '20px' : '16px',
      h: isPc ? '20px' : '16px'
    };

    return (
      <Flex
        alignItems={'flex-start'}
        justifyContent={'space-between'}
        w={'100%'}
        mt={0}
        pr={[3, 4]}
        pl={[3, 4]}
        h={[8, 9]}
        gap={[0, 1]}
      >
        <Box flex={1} />
        {/* Right button group */}
        <Flex alignItems={'center'} gap={[0, 1]}>
          {/* Attachment Group */}
          <Flex alignItems={'center'} h={[8, 9]}>
            {/* file selector button */}
            {canUploadFile && (
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
          </Flex>

          {/* Divider Container */}
          {canUploadFile && (
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
      </Flex>
    );
  }, [
    isPc,
    canUploadFile,
    selectFileLabel,
    selectFileIcon,
    File,
    isChatting,
    canSendMessage,
    t,
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
        minH={['96px', '120px']}
        pt={fileList.length > 0 ? '0' : [3, 4]}
        pb={3}
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
          {/* file preview */}
          <Box px={[2, 3]}>
            <FilePreview fileList={fileList} removeFiles={removeFiles} />
          </Box>

          {RenderTextarea}
        </Box>

        <Box>{RenderButtonGroup}</Box>
      </Flex>
      <ComplianceTip type={'chat'} />
    </Box>
  );
};

export default React.memo(ChatInput);
