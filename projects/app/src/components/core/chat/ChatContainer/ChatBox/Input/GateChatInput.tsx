import React, { useRef, useCallback, useMemo, useState, useEffect, useContext } from 'react';
import { Box, Flex, Textarea, IconButton, useBreakpointValue } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type { ChatBoxInputFormType, ChatBoxInputType, SendPromptFnType } from '../type';
import { textareaMinH } from '../constants';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import FilePreview from '../../components/FilePreview';
import { useFileUpload } from '../hooks/useFileUpload';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import VoiceInput, { type VoiceInputComponentRef } from './VoiceInput';
import { useRouter } from 'next/router';
import { appWorkflow2Form } from '@fastgpt/global/core/app/utils';
import dynamic from 'next/dynamic';
import { AppContext } from '@/pageComponents/app/detail/context';
import { AppFormContext } from '@/pages/chat/gate/index';
import Icon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

const GateToolSelect = dynamic(
  () => import('@/pageComponents/app/detail/Gate/components/GateToolSelect'),
  {
    ssr: false
  }
);

const fileTypeFilter = (file: File) => {
  return (
    file.type.includes('image') ||
    documentFileType.split(',').some((type) => file.name.endsWith(type.trim()))
  );
};

type Props = {
  onSendMessage: SendPromptFnType;
  onStop: () => void;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
  resetInputVal: (val: ChatBoxInputType) => void;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  placeholder?: string;
  selectedTools?: FlowNodeTemplateType[];
  onSelectTools?: (toolIds: FlowNodeTemplateType[]) => void;
};

const GateChatInput = ({
  onSendMessage,
  onStop,
  TextareaDom,
  resetInputVal,
  chatForm,
  placeholder,
  selectedTools: externalSelectedToolIds,
  onSelectTools
}: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();
  const buttonSize = useBreakpointValue({ base: 'sm', md: 'md' });
  const VoiceInputRef = useRef<VoiceInputComponentRef>(null);

  // 使用AppFormContext替代本地appForm状态
  const { appForm, setAppForm } = useContext(AppFormContext);

  const { setValue, watch, control } = chatForm;
  const inputValue = watch('input');

  const outLinkAuthData = useContextSelector(ChatBoxContext, (v) => v.outLinkAuthData);
  const appId = useContextSelector(ChatBoxContext, (v) => v.appId);
  const chatId = useContextSelector(ChatBoxContext, (v) => v.chatId);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const fileSelectConfig = useContextSelector(ChatBoxContext, (v) => v.fileSelectConfig);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedTools = externalSelectedToolIds ?? [];
  const setSelectedToolIds = onSelectTools!;

  const { llmModelList } = useSystemStore();
  const modelList = useMemo(
    () => llmModelList.map((item) => ({ label: item.name, value: item.model })),
    [llmModelList]
  );
  const defaultModel = useMemo(() => getWebDefaultLLMModel(llmModelList).model, [llmModelList]);
  const [selectedModel, setSelectedModel] = useState(defaultModel);

  const showModelSelector = useMemo(() => {
    return router.pathname === '/chat/gate';
  }, [router.pathname]);

  // 是否显示工具选择器
  const showTools = useMemo(() => {
    return router.pathname === '/chat/gate';
  }, [router.pathname]);

  // 当模型选择变化时更新appForm
  useEffect(() => {
    if (!showTools) return;

    setAppForm((prevAppForm) => ({
      ...prevAppForm,
      aiSettings: {
        ...prevAppForm.aiSettings,
        model: selectedModel
      }
    }));
  }, [selectedModel, showTools, setAppForm]);

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

  const handleSend = useCallback(
    async (val?: string) => {
      if (!canSendMessage) return;
      const textareaValue = val || TextareaDom.current?.value || '';

      onSendMessage({
        text: textareaValue.trim(),
        files: fileList,
        gateModel: showModelSelector ? selectedModel : undefined,
        selectedTool: selectedTools.length > 0 ? selectedTools.join(',') : null // 将工具ID数组转换为逗号分隔的字符串
      });
      replaceFiles([]);
    },
    [
      TextareaDom,
      canSendMessage,
      fileList,
      onSendMessage,
      replaceFiles,
      showModelSelector,
      selectedModel,
      selectedTools
    ]
  );

  return (
    <Box
      w="full"
      maxW="100%"
      minH="132px"
      background="var(--White, #FFF)"
      border="0.5px solid rgba(0, 0, 0, 0.13)"
      boxShadow="0px 5px 16px -4px rgba(19, 51, 107, 0.08)"
      borderRadius="20px"
      position="relative"
      px={4}
      pb={'62px'}
      pt={fileList.length > 0 ? 0 : 4}
      overflow="hidden"
      transition="all 0.2s ease"
      _hover={{
        border: '0.5px solid rgba(0, 0, 0, 0.20)',
        boxShadow: '0px 5px 20px -4px rgba(19, 51, 107, 0.13)'
      }}
      _focus-within={{
        border: '0.5px solid rgba(0, 0, 0, 0.20)',
        boxShadow: '0px 5px 20px -4px rgba(19, 51, 107, 0.13)'
      }}
    >
      {/* file preview */}
      <Box px={[1, 3]}>
        <FilePreview fileList={fileList} removeFiles={removeFiles} />
      </Box>

      <Textarea
        ref={TextareaDom}
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
          if (clipboardData && (fileSelectConfig.canSelectFile || fileSelectConfig.canSelectImg)) {
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
        placeholder={placeholder}
        variant="unstyled"
        resize="none"
        minH="60px"
        maxH="300px"
        fontFamily="PingFang SC"
        fontSize="15px"
        lineHeight="1.6"
        letterSpacing="0.5px"
        overflowY="auto"
        css={{
          '&::-webkit-scrollbar': {
            width: '4px'
          },
          '&::-webkit-scrollbar-track': {
            width: '6px',
            background: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#E2E8F0',
            borderRadius: '24px'
          }
        }}
        _placeholder={{
          color: '#A4A4A4',
          fontSize: '15px'
        }}
      />
      {/* Bottom Toolbar */}
      <Flex
        position="absolute"
        left="0"
        right="0"
        bottom="3"
        px="4"
        justify="space-between"
        align="center"
        w="100%"
        maxW="100%"
      >
        <Flex align="center" gap={2} overflow="hidden" maxW="65%" flexShrink={1} flexWrap="nowrap">
          {showModelSelector && (
            <AIModelSelector
              list={modelList}
              value={selectedModel}
              showAvatar={false}
              onChange={setSelectedModel}
              bg={'myGray.50'}
              borderRadius={'lg'}
            />
          )}
          {showTools && (
            <GateToolSelect
              selectedTools={selectedTools}
              onToolsChange={setSelectedToolIds}
              buttonSize={buttonSize}
            />
          )}
        </Flex>

        <Flex align="center" gap="2px" flexShrink={0}>
          <IconButton
            aria-label="Upload file"
            icon={<MyIcon name={'support/gate/chat/paperclip'} w={'20px'} h={'20px'} />}
            size="auto" // 尝试移除buttonSize变量的影响
            variant="ghost"
            display="flex"
            padding="8px"
            alignItems="center"
            minW="36px" // 使用minW而不是w
            minH="36px" // 使用minH而不是h
            w="36px"
            h="36px"
            boxSize="36px" // 添加boxSize属性更强制性地控制尺寸
            onClick={() => onOpenSelectFile()}
            flexShrink={0}
            _hover={{
              background: 'var(--light-general-surface-opacity-005, rgba(17, 24, 36, 0.05))',
              '& svg path': {
                fill: '#3370FF !important'
              }
            }}
          />

          <IconButton
            aria-label="Voice input"
            icon={<Icon name={'support/gate/chat/voiceGray'} w={'20px'} h={'20px'} />}
            size="auto"
            variant="ghost"
            display="flex"
            padding="8px"
            w="36px"
            h="36px"
            alignItems="center"
            onClick={() => VoiceInputRef.current?.onSpeak?.()}
            flexShrink={0}
            _hover={{
              background: 'var(--light-general-surface-opacity-005, rgba(17, 24, 36, 0.05))',
              '& svg path': {
                fill: '#3370FF !important'
              }
            }}
          />

          <Box w="2px" h="16px" bg="#F0F1F6" mx={1} flexShrink={0} />

          {isChatting ? (
            <IconButton
              aria-label="Stop"
              icon={
                <MyIcon
                  animation={'zoomStopIcon 0.4s infinite alternate'}
                  width={['22px', '25px']}
                  height={['22px', '25px']}
                  name={'stop'}
                  color={'gray.500'}
                />
              }
              size="auto"
              onClick={onStop}
              borderRadius="12px"
              w="36px"
              h="36px"
              variant="ghost"
              flexShrink={0}
            />
          ) : (
            <IconButton
              aria-label="Send"
              icon={
                <MyIcon
                  name={'core/chat/sendFill'}
                  width={['18px', '20px']}
                  height={['18px', '20px']}
                  color={'white'}
                />
              }
              size="auto"
              bg={
                !canSendMessage
                  ? 'var(--light-general-surface-opacity-01, rgba(17, 24, 36, 0.10))'
                  : '#3370FF'
              }
              _hover={{
                bg: !canSendMessage
                  ? 'var(--light-general-surface-opacity-01, rgba(17, 24, 36, 0.10))'
                  : '#2860E1'
              }}
              borderRadius="12px"
              w="36px"
              h="36px"
              onClick={() => handleSend()}
              flexShrink={0}
            />
          )}
        </Flex>
      </Flex>

      <File onSelect={(files) => onSelectFile({ files })} />
      {/* <ComplianceTip type={'chat'} /> */}

      {/* voice input and loading container */}
      {!inputValue && (
        <VoiceInput
          ref={VoiceInputRef}
          onSendMessage={onSendMessage}
          resetInputVal={resetInputVal}
        />
      )}
    </Box>
  );
};

export default React.memo(GateChatInput);
