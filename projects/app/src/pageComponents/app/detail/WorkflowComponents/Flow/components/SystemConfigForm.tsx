import React, { type Dispatch, useCallback } from 'react';
import { useViewport } from 'reactflow';
import { Box } from '@chakra-ui/react';

import QGConfig from '@/components/core/app/QGConfig';
import TTSSelect from '@/components/core/app/TTSSelect';
import WhisperConfig from '@/components/core/app/WhisperConfig';
import InputGuideConfig from '@/components/core/app/InputGuideConfig';
import { TTSTypeEnum } from '@/web/core/app/constants';
import ScheduledTriggerConfig from '@/components/core/app/ScheduledTriggerConfig';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext, WorkflowInitContext } from '../../context/workflowInitContext';
import { type AppChatConfigType, type AppDetailType } from '@fastgpt/global/core/app/type';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import VariableEdit from '@/components/core/app/VariableEdit';
import { AppContext } from '@/pageComponents/app/detail/context';
import WelcomeTextConfig from '@/components/core/app/WelcomeTextConfig';
import FileSelect from '@/components/core/app/FileSelect';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import AutoExecConfig from '@/components/core/app/AutoExecConfig';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import {
  collectWorkflowStartInputAutoFillPatches,
  collectWorkflowStartOutputAutoFillRevertPatches
} from '@/web/core/workflow/workflowStartAutoFill';
import WelcomeQuestionsConfig from '@/components/core/app/WelcomeQuestionsConfig';

type ComponentProps = {
  chatConfig: AppChatConfigType;
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
  chatConfig: { welcomeConfig, welcomeText },
  setAppDetail,
  mode,
  isFolded,
  onToggleFold
}: ComponentProps & {
  isFolded?: boolean;
  onToggleFold?: () => void;
}) {
  const resolvedWelcomeText = welcomeConfig?.welcomeText ?? welcomeText;
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

function WelcomeQuestions({ chatConfig: { welcomeConfig }, setAppDetail, mode }: ComponentProps) {
  const { zoom } = useViewport();

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
      <WelcomeQuestionsConfig
        value={welcomeConfig?.welcomeQuestions}
        zoom={zoom}
        onChange={updateWelcomeQuestions}
      />
    </Box>
  );
}

function ChatStartVariable({ chatConfig: { variables = [] }, setAppDetail }: ComponentProps) {
  const updateVariables = useCallback(
    (value: VariableItemType[]) => {
      setAppDetail((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          variables: value
        }
      }));
    },
    [setAppDetail]
  );
  const { zoom } = useViewport();

  return <VariableEdit variables={variables} onChange={updateVariables} zoom={zoom} />;
}

function AutoExecute({ chatConfig: { autoExecute }, setAppDetail }: ComponentProps) {
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

function QuestionGuide({ chatConfig: { questionGuide }, setAppDetail }: ComponentProps) {
  return (
    <QGConfig
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

function TTSGuide({ chatConfig: { ttsConfig }, setAppDetail }: ComponentProps) {
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

function WhisperGuide({ chatConfig: { whisperConfig, ttsConfig }, setAppDetail }: ComponentProps) {
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

function ScheduledTrigger({
  chatConfig: { scheduledTriggerConfig },
  setAppDetail
}: ComponentProps) {
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

function QuestionInputGuide({ chatConfig: { chatInputGuide }, setAppDetail }: ComponentProps) {
  const appId = useContextSelector(AppContext, (v) => v.appDetail._id);
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

function FileSelectConfig({ chatConfig: { fileSelectConfig }, setAppDetail }: ComponentProps) {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const workflowStartNode = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v.workflowStartNode
  );
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);

  if (!workflowStartNode) return null;

  return (
    <FileSelect
      value={fileSelectConfig}
      onChange={(e) => {
        setAppDetail((state) => ({
          ...state,
          chatConfig: {
            ...state.chatConfig,
            fileSelectConfig: e
          }
        }));

        // Dynamic add or delete userFilesInput
        const canUploadFiles =
          e.canSelectFile ||
          e.canSelectImg ||
          e.canSelectVideo ||
          e.canSelectAudio ||
          e.canSelectCustomFileExtension;
        const repeatKey = workflowStartNode.outputs.find((item) => item.key === userFilesInput.key);
        if (canUploadFiles) {
          const patches = collectWorkflowStartInputAutoFillPatches({
            nodes,
            edges,
            workflowStartNode: {
              ...workflowStartNode,
              outputs: repeatKey
                ? workflowStartNode.outputs
                : [...workflowStartNode.outputs, userFilesInput]
            }
          });

          onChangeNode([
            ...(!repeatKey
              ? [
                  {
                    nodeId: workflowStartNode.nodeId,
                    type: 'addOutput' as const,
                    value: userFilesInput
                  }
                ]
              : []),
            ...patches.map((patch) => ({ ...patch, type: 'updateInput' as const }))
          ]);
        } else if (repeatKey) {
          const patches = collectWorkflowStartOutputAutoFillRevertPatches({
            nodes,
            edges,
            workflowStartNode,
            outputKey: userFilesInput.key
          });

          onChangeNode([
            ...patches.map((patch) => ({ ...patch, type: 'updateInput' as const })),
            {
              nodeId: workflowStartNode.nodeId,
              type: 'delOutput',
              key: userFilesInput.key
            }
          ]);
        }
      }}
    />
  );
}
