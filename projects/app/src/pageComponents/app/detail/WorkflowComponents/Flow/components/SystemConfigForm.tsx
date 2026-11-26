import React, { type Dispatch, useCallback, useMemo } from 'react';
import { Box } from '@chakra-ui/react';

import QGConfig from '@/components/core/app/QGConfig';
import TTSSelect from '@/components/core/app/TTSSelect';
import WhisperConfig from '@/components/core/app/WhisperConfig';
import InputGuideConfig from '@/components/core/app/InputGuideConfig';
import { TTSTypeEnum } from '@/web/core/app/constants';
import ScheduledTriggerConfig from '@/components/core/app/ScheduledTriggerConfig';
import { useContextSelector } from 'use-context-selector';
import { AppChatConfigTypeSchema, type AppDetailType } from '@fastgpt/global/core/app/type';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { normalizeAndParseVariableList } from '@fastgpt/global/core/app/variable/utils';
import {
  defaultAutoExecuteConfig,
  defaultChatInputGuideConfig,
  defaultQGConfig,
  defaultTTSConfig,
  defaultWhisperConfig
} from '@fastgpt/global/core/app/constants';
import VariableEdit from '@/components/core/app/VariableEdit';
import { AppContext } from '@/pageComponents/app/detail/context';
import WelcomeTextConfig from '@/components/core/app/WelcomeTextConfig';
import FileSelect from '@/components/core/app/FileSelect';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/output';
import AutoExecConfig from '@/components/core/app/AutoExecConfig';
import {
  useWorkflowRuntime,
  useWorkflowSnapshot
} from '@/web/core/workflow/editor/session/workflowSession';
import type { WorkflowCommand } from '@fastgpt/global/core/workflow/editor/types';
import { FlowNodeOutputItemTypeSchema } from '@fastgpt/global/core/workflow/type/io';
import WelcomeQuestionsConfig from '@/components/core/app/WelcomeQuestionsConfig';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { countNewReferenceIssues } from './utils';

type ComponentProps = {
  setAppDetail: Dispatch<React.SetStateAction<AppDetailType>>;
  mode?: 'node' | 'drawer';
  isWelcomeTextFolded?: boolean;
  onToggleWelcomeTextFold?: () => void;
};

export function SystemConfigForm(props: ComponentProps) {
  const isDrawerMode = props.mode === 'drawer';
  const configItems = (
    <>
      <ConfigSection isDrawerMode={isDrawerMode} mt={2} pt={2}>
        <ChatStartVariable {...props} />
      </ConfigSection>
      <ConfigSection isDrawerMode={isDrawerMode} mt={3} pt={3} borderTop={'base'}>
        <FileSelectConfig {...props} />
      </ConfigSection>
      <ConfigSection isDrawerMode={isDrawerMode} mt={3} pt={3} borderTop={'base'}>
        <TTSGuide {...props} />
      </ConfigSection>
      <ConfigSection isDrawerMode={isDrawerMode} mt={3} pt={3} borderTop={'base'}>
        <WhisperGuide {...props} />
      </ConfigSection>
      <ConfigSection isDrawerMode={isDrawerMode} mt={3} pt={4} borderTop={'base'}>
        <QuestionGuide {...props} />
      </ConfigSection>
      <ConfigSection isDrawerMode={isDrawerMode} mt={4} pt={3} borderTop={'base'}>
        <ScheduledTrigger {...props} />
      </ConfigSection>
      <ConfigSection isDrawerMode={isDrawerMode} mt={3} pt={3} borderTop={'base'}>
        <QuestionInputGuide {...props} />
      </ConfigSection>
      <ConfigSection isDrawerMode={isDrawerMode} isLastDrawerItem mt={3} pt={3} borderTop={'base'}>
        <AutoExecute {...props} />
      </ConfigSection>
    </>
  );

  if (isDrawerMode) {
    return (
      <Box display={'flex'} w={'100%'} flexDirection={'column'}>
        <WelcomeText
          {...props}
          isFolded={props.isWelcomeTextFolded}
          onToggleFold={props.onToggleWelcomeTextFold}
        />
        {!props.isWelcomeTextFolded && (
          <Box mt={2}>
            <WelcomeQuestions {...props} />
          </Box>
        )}
        <Box mt={3} h={'1px'} w={'100%'} bg={'myGray.200'} flexShrink={0} />
        {configItems}
      </Box>
    );
  }

  return (
    <>
      <WelcomeText {...props} />
      <WelcomeQuestions {...props} />
      {configItems}
    </>
  );
}

function ConfigSection({
  isDrawerMode,
  isLastDrawerItem = false,
  children,
  ...boxProps
}: {
  isDrawerMode: boolean;
  isLastDrawerItem?: boolean;
  children: React.ReactNode;
} & React.ComponentProps<typeof Box>) {
  if (isDrawerMode) {
    return (
      <Box
        w={'100%'}
        pt={3}
        pb={3}
        borderBottom={!isLastDrawerItem ? 'sm' : undefined}
        borderColor={'myGray.200'}
        sx={{
          '& > .chakra-flex, & > .chakra-box > .chakra-flex:first-of-type': {
            minH: 8,
            width: '100%'
          },
          '& button.chakra-button': {
            minH: 8,
            height: 8,
            fontSize: 'sm',
            lineHeight: 5,
            color: 'myGray.600',
            fontWeight: 'medium',
            letterSpacing: 0,
            mr: 0,
            py: 1.5,
            px: 2
          }
        }}
      >
        {children}
      </Box>
    );
  }

  return (
    <Box borderColor={'myGray.200'} {...boxProps}>
      {children}
    </Box>
  );
}

function WelcomeText({
  setAppDetail,
  mode,
  isFolded,
  onToggleFold
}: ComponentProps & {
  isFolded?: boolean;
  onToggleFold?: () => void;
}) {
  const resolvedWelcomeText = useContextSelector(AppContext, (v) => {
    const chatConfig = v.appDetail.chatConfig;
    return chatConfig?.welcomeConfig?.welcomeText ?? chatConfig?.welcomeText;
  });
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setAppDetail((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          welcomeConfig: {
            ...state.chatConfig.welcomeConfig,
            welcomeText: value
          },
          welcomeText: value
        }
      }));
    },
    [setAppDetail]
  );

  return (
    <Box className="nodrag" w={'100%'}>
      <WelcomeTextConfig
        drawerMode={mode === 'drawer'}
        isFolded={isFolded}
        onToggleFold={onToggleFold}
        resize={mode === 'drawer' ? 'none' : 'both'}
        value={resolvedWelcomeText}
        onChange={handleChange}
      />
    </Box>
  );
}

function WelcomeQuestions({ setAppDetail, mode }: ComponentProps) {
  const welcomeQuestions = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.welcomeConfig?.welcomeQuestions
  );
  const updateWelcomeQuestions = useCallback(
    (value: string[]) => {
      setAppDetail((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          welcomeConfig: {
            ...state.chatConfig.welcomeConfig,
            welcomeQuestions: value
          }
        }
      }));
    },
    [setAppDetail]
  );

  return (
    <Box className="nodrag" w={'100%'} mt={mode === 'drawer' ? 0 : 2}>
      <WelcomeQuestionsConfig value={welcomeQuestions} onChange={updateWelcomeQuestions} />
    </Box>
  );
}

const emptyVariables: VariableItemType[] = [];

function ChatStartVariable({ setAppDetail }: ComponentProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const runtime = useWorkflowRuntime();
  const variables = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.variables ?? emptyVariables
  );
  const normalizedVariables = useMemo(() => normalizeAndParseVariableList(variables), [variables]);
  const updateVariables = useCallback(
    (value: VariableItemType[]) => {
      if (runtime && !runtime.isDisposed()) {
        const currentIssues = runtime.getWorkflowIssues();
        const before = [...currentIssues.issues, ...currentIssues.chatConfigIssues];
        const result = runtime.dispatch({
          type: 'updateChatConfig',
          chatConfig: AppChatConfigTypeSchema.parse({
            ...runtime.getWorkflow().chatConfig,
            variables: value
          })
        });

        if (result.ok) {
          const nextIssues = runtime.getWorkflowIssues();
          const affected = countNewReferenceIssues(before, [
            ...nextIssues.issues,
            ...nextIssues.chatConfigIssues
          ]);
          if (affected > 0) {
            toast({
              status: 'warning',
              title: t('workflow:variable_change_affects_references', { count: affected })
            });
          }
        }
      }

      setAppDetail((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          variables: value
        }
      }));
    },
    [runtime, setAppDetail, t, toast]
  );

  return <VariableEdit variables={normalizedVariables} onChange={updateVariables} />;
}

function AutoExecute({ setAppDetail }: ComponentProps) {
  const autoExecute = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.autoExecute ?? defaultAutoExecuteConfig
  );
  return (
    <AutoExecConfig
      value={autoExecute}
      onChange={(e) =>
        setAppDetail((state) => ({
          ...state,
          chatConfig: {
            ...state.chatConfig,
            autoExecute: e
          }
        }))
      }
    />
  );
}

function QuestionGuide({ setAppDetail }: ComponentProps) {
  const questionGuide = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.questionGuide ?? defaultQGConfig
  );
  const appId = useContextSelector(AppContext, (v) => v.appDetail._id);
  return (
    <QGConfig
      appId={appId || undefined}
      value={questionGuide}
      onChange={(e) => {
        setAppDetail((state) => ({
          ...state,
          chatConfig: {
            ...state.chatConfig,
            questionGuide: e
          }
        }));
      }}
    />
  );
}

function TTSGuide({ setAppDetail }: ComponentProps) {
  const ttsConfig = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.ttsConfig ?? defaultTTSConfig
  );
  return (
    <TTSSelect
      value={ttsConfig}
      onChange={(e) => {
        setAppDetail((state) => ({
          ...state,
          chatConfig: {
            ...state.chatConfig,
            ttsConfig: e
          }
        }));
      }}
    />
  );
}

function WhisperGuide({ setAppDetail }: ComponentProps) {
  const whisperConfig = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.whisperConfig ?? defaultWhisperConfig
  );
  const ttsConfig = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.ttsConfig ?? defaultTTSConfig
  );
  return (
    <WhisperConfig
      isOpenAudio={ttsConfig?.type !== TTSTypeEnum.none}
      value={whisperConfig}
      onChange={(e) => {
        setAppDetail((state) => ({
          ...state,
          chatConfig: {
            ...state.chatConfig,
            whisperConfig: e
          }
        }));
      }}
    />
  );
}

function ScheduledTrigger({ setAppDetail }: ComponentProps) {
  const scheduledTriggerConfig = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.scheduledTriggerConfig
  );
  return (
    <ScheduledTriggerConfig
      value={scheduledTriggerConfig}
      onChange={(e) => {
        setAppDetail((state) => ({
          ...state,
          chatConfig: {
            ...state.chatConfig,
            scheduledTriggerConfig: e
          }
        }));
      }}
    />
  );
}

function QuestionInputGuide({ setAppDetail }: ComponentProps) {
  const appId = useContextSelector(AppContext, (v) => v.appDetail._id);
  const chatInputGuide = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.chatInputGuide ?? defaultChatInputGuideConfig
  );
  return appId ? (
    <InputGuideConfig
      appId={appId}
      value={chatInputGuide}
      onChange={(e) => {
        setAppDetail((state) => ({
          ...state,
          chatConfig: {
            ...state.chatConfig,
            chatInputGuide: e
          }
        }));
      }}
    />
  ) : null;
}

function FileSelectConfig({ setAppDetail }: ComponentProps) {
  const fileSelectConfig = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.fileSelectConfig
  );
  const runtime = useWorkflowRuntime();
  const startNodeId = useWorkflowSnapshot()?.nodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
  )?.nodeId;

  // 工具（Plugin host）没有流程开始节点，不提供工作流文件上传配置。
  if (startNodeId === undefined) return null;

  return (
    <FileSelect
      value={fileSelectConfig}
      onChange={(fileSelectConfig) => {
        if (!runtime || runtime.isDisposed()) {
          setAppDetail((state) => ({
            ...state,
            chatConfig: { ...state.chatConfig, fileSelectConfig }
          }));
          return;
        }

        const commands: WorkflowCommand[] = [
          {
            type: 'updateChatConfig',
            chatConfig: AppChatConfigTypeSchema.parse({
              ...runtime.getWorkflow().chatConfig,
              fileSelectConfig
            })
          }
        ];
        const canUploadFiles =
          fileSelectConfig.canSelectFile ||
          fileSelectConfig.canSelectImg ||
          fileSelectConfig.canSelectVideo ||
          fileSelectConfig.canSelectAudio ||
          fileSelectConfig.canSelectCustomFileExtension;
        const startNode = runtime.getNode(startNodeId);
        if (startNode?.flowNodeType === FlowNodeTypeEnum.workflowStart) {
          const hasFileOutput = startNode.outputs.some(
            (output) => output.key === userFilesInput.key
          );
          if (canUploadFiles || hasFileOutput) {
            // 输出已存在时也提交，让 Runtime 为旧流程补填空白引用。
            const outputs = canUploadFiles
              ? [...startNode.outputs, ...(hasFileOutput ? [] : [userFilesInput])]
              : startNode.outputs.filter((output) => output.key !== userFilesInput.key);
            commands.push({
              type: 'updateNode',
              nodeId: startNodeId,
              patch: { outputs: FlowNodeOutputItemTypeSchema.array().parse(outputs) }
            });
          }
        }
        runtime.dispatch(commands);
      }}
    />
  );
}
