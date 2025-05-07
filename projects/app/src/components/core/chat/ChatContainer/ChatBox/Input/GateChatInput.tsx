import React, { useRef, useCallback, useMemo, useState, useEffect, useContext } from 'react';
import {
  Box,
  Flex,
  Textarea,
  IconButton,
  useBreakpointValue,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { ChatBoxInputFormType, ChatBoxInputType, SendPromptFnType } from '../type';
import { textareaMinH } from '../constants';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import FilePreview from '../../components/FilePreview';
import { useFileUpload } from '../hooks/useFileUpload';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import VoiceInput, { type VoiceInputComponentRef } from './VoiceInput';
import { useRouter } from 'next/router';
import { getDefaultAppForm, appWorkflow2Form } from '@fastgpt/global/core/app/utils';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { getMyAppsGate } from '@/web/core/app/api';
import { form2AppWorkflow } from '@/web/core/app/utils';
import dynamic from 'next/dynamic';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { AppContext } from '@/pageComponents/app/detail/context';
import { AppFormContext } from '@/pages/chat/gate/index';

const ToolSelect = dynamic(() => import('@/pageComponents/app/detail/Gate/components/ToolSelect'), {
  ssr: false
});

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
};

const GateChatInput = ({
  onSendMessage,
  onStop,
  TextareaDom,
  resetInputVal,
  chatForm,
  placeholder = '你可以问我任何问题'
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
  const whisperConfig = useContextSelector(ChatBoxContext, (v) => v.whisperConfig);
  const fileSelectConfig = useContextSelector(ChatBoxContext, (v) => v.fileSelectConfig);

  const [showToolSelect, setShowToolSelect] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { llmModelList } = useSystemStore();
  const modelList = useMemo(
    () => llmModelList.map((item) => ({ label: item.name, value: item.model })),
    [llmModelList]
  );
  const defaultModel = useMemo(() => getWebDefaultLLMModel(llmModelList).model, [llmModelList]);
  const [selectedModel, setSelectedModel] = useState(defaultModel);

  const showModelSelector = useMemo(() => {
    return (
      router.pathname.startsWith('/chat/gate') &&
      !router.pathname.includes('/chat/gate/application')
    );
  }, [router.pathname]);

  // 是否显示工具选择器
  const showTools = useMemo(() => {
    return router.pathname === '/chat/gate';
  }, [router.pathname]);

  // 初始化加载appForm - 从Gate应用获取配置
  useEffect(() => {
    if (!appId || !showTools) return;

    const fetchAppForm = async () => {
      try {
        // 加载Gate应用列表
        // 获取当前应用或第一个可用的Gate应用
        const currentApp = appDetail;

        if (currentApp && currentApp.modules) {
          // 将模块转换为appForm格式
          const form = appWorkflow2Form({
            nodes: currentApp.modules,
            chatConfig: currentApp.chatConfig || {}
          });
          setAppForm(form);
          // 如果选择了模型，设置为默认模型
          if (form.aiSettings.model) {
            setSelectedModel(form.aiSettings.model);
          }
        }
      } catch (error) {
        console.error('加载Gate应用信息失败:', error);
      }
    };

    fetchAppForm();
  }, [appId, showTools, appDetail, setAppForm]);

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
    hasFileUploading,
    showSelectFile,
    showSelectImg
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
        selectedTool // 传递选中的工具ID
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
      selectedTool
    ]
  );

  // 工具列表菜单

  return (
    <Box
      w="full"
      maxW="700px"
      minH="132px"
      bg="white"
      border="0.5px solid rgba(0, 0, 0, 0.13)"
      boxShadow="0px 5px 16px -4px rgba(19, 51, 107, 0.08)"
      borderRadius="20px"
      position="relative"
      p={4}
      pb="56px"
    >
      {/* Tool select configuration */}
      {showToolSelect && (
        <Box mb={4} p={3} bg="gray.50" borderRadius="md">
          <ToolSelect appForm={appForm} setAppForm={setAppForm} />
        </Box>
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
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
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
      <Flex position="absolute" left="3" bottom="3" gap={2} align="center">
        {showModelSelector && (
          <AIModelSelector
            value={selectedModel}
            list={modelList}
            onChange={setSelectedModel}
            minW="128px"
            maxW="200px"
            w="auto"
            bg="#F9F9F9"
            border="0.5px solid #E0E0E0"
            borderRadius="10px"
            color="#485264"
            h="36px"
            fontSize="14px"
          />
        )}
      </Flex>

      <Flex position="absolute" right="4" bottom="3" align="center" gap={2}>
        {showTools && (
          <IconButton
            aria-label="Configure Tools"
            icon={<MyIcon name={'core/app/toolCall'} w={'20px'} />}
            size={buttonSize}
            variant="ghost"
            borderRadius="6px"
            w="36px"
            h="36px"
            onClick={() => setShowToolSelect(!showToolSelect)}
          />
        )}
        {(showSelectFile || showSelectImg) && (
          <IconButton
            aria-label="Upload file"
            icon={<MyIcon name={'support/gate/chat/fileGray'} w={'20px'} />}
            size={buttonSize}
            variant="ghost"
            borderRadius="6px"
            w="36px"
            h="36px"
            onClick={() => onOpenSelectFile()}
          />
        )}
        {whisperConfig?.open && (
          <IconButton
            aria-label="Voice input"
            icon={<MyIcon name={'support/gate/chat/voiceGray'} w={'20px'} />}
            size={buttonSize}
            variant="ghost"
            borderRadius="6px"
            w="36px"
            h="36px"
            onClick={() => VoiceInputRef.current?.onSpeak?.()}
          />
        )}

        <Box w="2px" h="16px" bg="#F0F1F6" mx={2} />

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
            size={buttonSize}
            onClick={onStop}
            borderRadius="12px"
            w="36px"
            h="36px"
            variant="ghost"
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
            size={buttonSize}
            bg={!canSendMessage ? 'rgba(17, 24, 36, 0.1)' : '#3370FF'}
            _hover={{
              bg: !canSendMessage ? 'rgba(17, 24, 36, 0.1)' : '#2860E1'
            }}
            borderRadius="12px"
            w="36px"
            h="36px"
            isDisabled={!canSendMessage}
            onClick={() => handleSend()}
          />
        )}
      </Flex>

      <File onSelect={(files) => onSelectFile({ files })} />
      <ComplianceTip type={'chat'} />
    </Box>
  );
};

export default React.memo(GateChatInput);
