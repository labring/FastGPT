import React, { type Dispatch, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useViewport } from 'reactflow';
import { Box, Flex, Switch } from '@chakra-ui/react';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

import QGConfig from '@/components/core/app/QGConfig';
import TTSSelect from '@/components/core/app/TTSSelect';
import WhisperConfig from '@/components/core/app/WhisperConfig';
import InputGuideConfig from '@/components/core/app/InputGuideConfig';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { TTSTypeEnum } from '@/web/core/app/constants';
import NodeCard from './render/NodeCard';
import ScheduledTriggerConfig from '@/components/core/app/ScheduledTriggerConfig';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { WorkflowBufferDataContext, WorkflowInitContext } from '../../context/workflowInitContext';
import {
  type AppChatConfigType,
  type AppDetailType,
  type VariableItemType
} from '@fastgpt/global/core/app/type';
import VariableEdit from '@/components/core/app/VariableEdit';
import { AppContext } from '@/pageComponents/app/detail/context';
import WelcomeTextConfig from '@/components/core/app/WelcomeTextConfig';
import FileSelect from '@/components/core/app/FileSelect';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import Container from '../components/Container';
import AutoExecConfig from '@/components/core/app/AutoExecConfig';
import ChatFunctionTip from '@/components/core/app/Tip';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import {
  collectWorkflowStartInputAutoFillPatches,
  collectWorkflowStartOutputAutoFillRevertPatches
} from '@/web/core/workflow/workflowStartAutoFill';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import { defaultQGConfig } from '@fastgpt/global/core/app/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import WelcomeQuestionsConfig from '@/components/core/app/WelcomeQuestionsConfig';

type ComponentProps = {
  chatConfig: AppChatConfigType;
  setAppDetail: Dispatch<React.SetStateAction<AppDetailType>>;
  mode?: 'node' | 'drawer';
};

const NodeUserGuide = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);

  const chatConfig = useMemo<AppChatConfigType>(() => {
    return getAppChatConfig({
      chatConfig: appDetail.chatConfig,
      systemConfigNode: data,
      isPublicFetch: true
    });
  }, [data, appDetail.chatConfig]);

  const componentsProps = useMemo(
    () => ({
      chatConfig,
      setAppDetail
    }),
    [chatConfig, setAppDetail]
  );

  return (
    <NodeCard
      selected={selected}
      menuForbid={{
        debug: true,
        copy: true,
        delete: true
      }}
      {...data}
    >
      <Container>
        <SystemConfigForm {...componentsProps} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeUserGuide);

export function SystemConfigForm(props: ComponentProps) {
  const isDrawerMode = props.mode === 'drawer';
  const [isWelcomeTextFolded, setIsWelcomeTextFolded] = useState(false);
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
          isFolded={isWelcomeTextFolded}
          onToggleFold={() => setIsWelcomeTextFolded((state) => !state)}
        />
        {!isWelcomeTextFolded && (
          <Box mt={'8px'}>
            <WelcomeQuestions {...props} />
          </Box>
        )}
        <Box mt={'12px'} h={'1px'} w={'100%'} bg={'#E8EBF0'} flexShrink={0} />
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
        pt={'12px'}
        pb={'12px'}
        borderBottom={!isLastDrawerItem ? '1px solid' : undefined}
        borderColor={'#E8EBF0'}
        sx={{
          '& > .chakra-flex, & > .chakra-box > .chakra-flex:first-of-type': {
            minH: '32px'
          },
          '& button.chakra-button': {
            minH: '32px',
            height: '32px',
            fontFamily: 'PingFang SC',
            fontSize: '14px',
            lineHeight: '20px',
            color: '#485264',
            fontWeight: 500,
            letterSpacing: '0.1px',
            padding: '6px 8px'
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

const DrawerConfigRow = ({
  icon,
  label,
  tipContent,
  rightContent
}: {
  icon: IconNameType;
  label: string;
  tipContent?: React.ReactNode;
  rightContent: React.ReactNode;
}) => {
  return (
    <Flex alignItems={'center'} w={'100%'} minH={'32px'}>
      <MyIcon name={icon} w={'20px'} />
      <FormLabel ml={2}>{label}</FormLabel>
      {tipContent}
      <Box flex={1} />
      {rightContent}
    </Flex>
  );
};

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
  const welcomeQuestions = useMemo(
    () => welcomeConfig?.welcomeQuestions ?? [''],
    [welcomeConfig?.welcomeQuestions]
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
      <WelcomeQuestionsConfig
        value={welcomeQuestions}
        zoom={zoom}
        drawerMode={mode === 'drawer'}
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

  return <VariableEdit variables={variables} onChange={(e) => updateVariables(e)} zoom={zoom} />;
}

function AutoExecute({ chatConfig: { autoExecute }, setAppDetail, mode }: ComponentProps) {
  return (
    <AutoExecConfig
      value={autoExecute}
      drawerMode={mode === 'drawer'}
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

function QuestionGuide({ chatConfig: { questionGuide }, setAppDetail, mode }: ComponentProps) {
  const { t } = useTranslation();
  const config = questionGuide ?? defaultQGConfig;
  if (mode === 'drawer') {
    return (
      <DrawerConfigRow
        icon={'core/chat/QGFill'}
        label={t('common:core.app.Question Guide')}
        tipContent={<ChatFunctionTip type={'nextQuestion'} />}
        rightContent={
          <Switch
            isChecked={config.open}
            onChange={(e) => {
              setAppDetail((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  questionGuide: {
                    ...config,
                    open: e.target.checked
                  }
                }
              }));
            }}
          />
        }
      />
    );
  }

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

function TTSGuide({ chatConfig: { ttsConfig }, setAppDetail, mode }: ComponentProps) {
  return (
    <TTSSelect
      value={ttsConfig}
      drawerMode={mode === 'drawer'}
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

function WhisperGuide({
  chatConfig: { whisperConfig, ttsConfig },
  setAppDetail,
  mode
}: ComponentProps) {
  return (
    <WhisperConfig
      isOpenAudio={ttsConfig?.type !== TTSTypeEnum.none}
      value={whisperConfig}
      drawerMode={mode === 'drawer'}
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
  setAppDetail,
  mode
}: ComponentProps) {
  return (
    <ScheduledTriggerConfig
      value={scheduledTriggerConfig}
      drawerMode={mode === 'drawer'}
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

function QuestionInputGuide({
  chatConfig: { chatInputGuide },
  setAppDetail,
  mode
}: ComponentProps) {
  const appId = useContextSelector(AppContext, (v) => v.appDetail._id);
  return appId ? (
    <InputGuideConfig
      appId={appId}
      value={chatInputGuide}
      drawerMode={mode === 'drawer'}
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

function FileSelectConfig({
  chatConfig: { fileSelectConfig },
  setAppDetail,
  mode
}: ComponentProps) {
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
      drawerMode={mode === 'drawer'}
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
