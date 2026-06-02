import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useFieldArray, useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import FilePreview from '../../../components/FilePreview';
import { WorkflowRuntimeContext } from '../../../context/workflowRuntimeContext';
import { ChatBoxContext } from '../../Provider';
import type { ChatBoxInputFormType, ChatBoxInputType, UserInputFileItemType } from '../../type';
import { useFileUpload } from '../../hooks/useFileUpload';
import VoiceInput, { type VoiceInputComponentRef } from '../../Input/VoiceInput';

type HumanChatBubbleEditFormProps = {
  defaultValue: string;
  defaultFiles?: UserInputFileItemType[];
  onCancel: () => void;
  onSubmit?: (input: ChatBoxInputType) => void | Promise<void>;
  showCancel?: boolean;
};

/**
 * 渲染用户消息的编辑态 UI。
 *
 * 当前组件只负责编辑态展示和本地文本收集；真正的“删除后续记录并重新发送”会在上层
 * record action 接入后通过 `onSubmit` 注入，避免 UI 组件直接依赖聊天生成流程。
 */
const HumanChatBubbleEditForm = ({
  defaultValue,
  defaultFiles = [],
  onCancel,
  onSubmit,
  showCancel = true
}: HumanChatBubbleEditFormProps) => {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const VoiceInputRef = useRef<VoiceInputComponentRef>(null);
  const [value, setValue] = useState(defaultValue);
  const trimmedValue = value.trim();
  const [mobilePreSpeak, setMobilePreSpeak] = useState(false);

  const fileSelectConfig = useContextSelector(ChatBoxContext, (v) => v.fileSelectConfig);
  const whisperConfig = useContextSelector(ChatBoxContext, (v) => v.whisperConfig);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const editForm = useForm<ChatBoxInputFormType>({
    defaultValues: {
      input: '',
      files: defaultFiles,
      chatStarted: false,
      variables: {}
    }
  });
  const fileCtrl = useFieldArray({
    control: editForm.control,
    name: 'files'
  });
  const {
    File,
    onOpenSelectFile,
    fileList,
    onSelectFile,
    uploadFiles,
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
  const canUploadFile =
    showSelectFile ||
    showSelectImg ||
    showSelectVideo ||
    showSelectAudio ||
    showSelectCustomFileExtension;
  const defaultFileUrls = new Set(defaultFiles.map((file) => file.url || file.id));
  const filesChanged =
    fileList.length !== defaultFiles.length ||
    fileList.some((file) => !defaultFileUrls.has(file.url || file.id));
  const canSubmit =
    !hasFileUploading &&
    trimmedValue.length > 0 &&
    (trimmedValue !== defaultValue.trim() || filesChanged);

  useRequest(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, outLinkAuthData, chatId]
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
  }, []);

  const renderVoiceInput = () => (
    <VoiceInput
      ref={VoiceInputRef}
      handleSend={(text) => {
        onSubmit?.({
          text: text.trim(),
          files: fileList
        });
        replaceFiles([]);
      }}
      resetInputVal={(text) => {
        setMobilePreSpeak(false);
        setValue(text);
      }}
      mobilePreSpeak={mobilePreSpeak}
      setMobilePreSpeak={setMobilePreSpeak}
    />
  );

  return (
    <Box w={'100%'} maxW={'100%'} pt={mobilePreSpeak ? '48px' : 0}>
      <Box
        position={'relative'}
        h={mobilePreSpeak ? '48px' : 'auto'}
        borderRadius={'12px'}
        border={mobilePreSpeak ? 'none' : '2px solid'}
        borderColor={mobilePreSpeak ? 'transparent' : 'primary.600'}
        boxShadow={mobilePreSpeak ? 'none' : '0 0 0 3px rgba(51, 112, 255, 0.16)'}
        bg={mobilePreSpeak ? 'transparent' : 'white'}
        overflow={'hidden'}
      >
        {!mobilePreSpeak && (
          <Box px={'12px'}>
            <FilePreview fileList={fileList} removeFiles={removeFiles} />
          </Box>
        )}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          h={'116px'}
          rows={4}
          resize={'none'}
          px={'12px'}
          pt={'10px'}
          pb={'10px'}
          border={'none'}
          bg={'white'}
          color={'myGray.900'}
          fontSize={['md', '20px']}
          lineHeight={'24px'}
          fontWeight={400}
          _focusVisible={{
            border: 'none',
            boxShadow: 'none'
          }}
        />
        {renderVoiceInput()}
      </Box>

      {!mobilePreSpeak && (
        <Flex
          pt={'8px'}
          alignItems={'center'}
          justifyContent={showCancel ? 'flex-end' : 'space-between'}
          gap={'8px'}
        >
          <Flex alignItems={'center'} gap={'8px'} color={'myGray.500'}>
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              w={'36px'}
              h={'36px'}
              p={'8px'}
              borderRadius={'sm'}
              cursor={canUploadFile ? 'pointer' : 'not-allowed'}
              opacity={canUploadFile ? 1 : 0.4}
              _hover={canUploadFile ? { bg: 'rgba(0, 0, 0, 0.04)' } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (canUploadFile) {
                  onOpenSelectFile();
                }
              }}
            >
              <MyTooltip label={t('chat:select_file')}>
                <MyIcon name={'core/chat/fileSelect'} w={'20px'} h={'20px'} color={'#707070'} />
              </MyTooltip>
            </Flex>
            <File onSelect={(files) => onSelectFile({ files })} />
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              w={'36px'}
              h={'36px'}
              p={'8px'}
              borderRadius={'sm'}
              cursor={whisperConfig?.open ? 'pointer' : 'not-allowed'}
              opacity={whisperConfig?.open ? 1 : 0.4}
              _hover={whisperConfig?.open ? { bg: 'rgba(0, 0, 0, 0.04)' } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                VoiceInputRef.current?.onSpeak?.();
              }}
            >
              <MyTooltip label={t('common:core.chat.Record')}>
                <MyIcon name={'core/chat/recordFill'} w={'20px'} h={'20px'} color={'#707070'} />
              </MyTooltip>
            </Flex>
          </Flex>

          {showCancel && <Box h={'22px'} w={'1px'} bg={'myGray.200'} />}

          {showCancel && (
            <Button
              variant={'unstyled'}
              w={'69px'}
              h={'36px'}
              color={'primary.600'}
              fontSize={'14px'}
              fontWeight={500}
              onClick={onCancel}
            >
              {t('common:Cancel')}
            </Button>
          )}
          <Button
            w={'69px'}
            h={'36px'}
            borderRadius={'8px'}
            variant={'primary'}
            fontSize={'14px'}
            isDisabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onSubmit?.({
                text: trimmedValue,
                files: fileList
              });
            }}
          >
            {t('common:Update')}
          </Button>
        </Flex>
      )}
    </Box>
  );
};

export default React.memo(HumanChatBubbleEditForm);
