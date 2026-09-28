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
import { userFilesInput } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import AutoExecConfig from '@/components/core/app/AutoExecConfig';
import { WorkflowHostContext } from '@/web/core/workflow/editor/host';
import type { WorkflowCommand } from '@fastgpt/global/core/workflow/editor/types';
import {
  FlowNodeInputItemTypeSchema,
  FlowNodeOutputItemTypeSchema
} from '@fastgpt/global/core/workflow/type/io';
import {
  collectWorkflowStartInputAutoFillPatches,
  collectWorkflowStartOutputAutoFillRevertPatches
} from '@/web/core/workflow/workflowStartAutoFill';
import WelcomeQuestionsConfig from '@/components/core/app/WelcomeQuestionsConfig';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useWorkflowDocument } from '../nodes/render/useWorkflowDocument';

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
  const variables = useContextSelector(
    AppContext,
    (v) => v.appDetail.chatConfig?.variables ?? emptyVariables
  );
  const normalizedVariables = useMemo(() => normalizeAndParseVariableList(variables), [variables]);
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
  // 文件上传开关同时更新开始节点输出和下游自动填充引用，合并为一个 Runtime 事务。
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);
  const { workflow } = useWorkflowDocument();
  // 只读快照与自动填充纯函数的入参只差 readonly 修饰，桥接沿用原 reader 的写法。
  const nodeList = workflow?.nodes as unknown as readonly FlowNodeItemType[] | undefined;
  // 工具（Plugin host）没有流程开始节点，此时整段配置不渲染。
  const workflowStartNode = useMemo(
    () => nodeList?.find((node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart),
    [nodeList]
  );

  if (!workflowStartNode) return null;

  return (
    <FileSelect
      value={fileSelectConfig}
      onChange={(e) => {
        // 自动填充按当前画布整体扫描；读取时机在点击回调内，取 store 最新值即可。
        const nodes = (nodeList ?? []).map((data) => ({
          id: data.nodeId,
          data,
          position: { x: 0, y: 0 }
        }));
        const edges = (workflow?.edges ?? []).map((edge) => ({
          id: `${edge.source}-${edge.target}-${edge.sourceHandle ?? ''}-${edge.targetHandle ?? ''}`,
          ...edge
        }));
        // Dynamic add or delete userFilesInput
        const canUploadFiles =
          e.canSelectFile ||
          e.canSelectImg ||
          e.canSelectVideo ||
          e.canSelectAudio ||
          e.canSelectCustomFileExtension;
        const repeatKey = workflowStartNode.outputs.find((item) => item.key === userFilesInput.key);
        const updateChatConfigCommand: WorkflowCommand = {
          type: 'updateChatConfig',
          chatConfig: AppChatConfigTypeSchema.parse({
            ...runtime?.getWorkflow().chatConfig,
            fileSelectConfig: e
          })
        };
        const buildInputUpdateCommands = (
          inputPatches: Array<{ nodeId: string; key: string; value: unknown }>
        ): WorkflowCommand[] => {
          const inputsByNode = new Map<
            string,
            ReturnType<typeof FlowNodeInputItemTypeSchema.parse>[]
          >();
          inputPatches.forEach((patch) => {
            const node = runtime?.getNode(patch.nodeId);
            if (!node) return;
            const inputs =
              inputsByNode.get(patch.nodeId) ??
              node.inputs.map((input) => FlowNodeInputItemTypeSchema.parse(input));
            const inputIndex = inputs.findIndex((input) => input.key === patch.key);
            if (inputIndex < 0) return;
            inputs[inputIndex] = FlowNodeInputItemTypeSchema.parse(patch.value);
            inputsByNode.set(patch.nodeId, inputs);
          });
          return [...inputsByNode].map(([nodeId, inputs]) => ({
            type: 'updateNode',
            nodeId,
            patch: { inputs }
          }));
        };
        if (!runtime || runtime.isDisposed()) {
          setAppDetail((state) => ({
            ...state,
            chatConfig: {
              ...state.chatConfig,
              fileSelectConfig: e
            }
          }));
          return;
        }
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

          const commands: WorkflowCommand[] = [updateChatConfigCommand];
          if (!repeatKey) {
            const node = runtime.getNode(workflowStartNode.nodeId);
            if (node)
              commands.push({
                type: 'updateNode',
                nodeId: node.nodeId,
                patch: {
                  outputs: [
                    ...node.outputs.map((output) => FlowNodeOutputItemTypeSchema.parse(output)),
                    FlowNodeOutputItemTypeSchema.parse(userFilesInput)
                  ]
                }
              });
          }
          commands.push(...buildInputUpdateCommands(patches));
          runtime.dispatch(commands);
        } else if (repeatKey) {
          const patches = collectWorkflowStartOutputAutoFillRevertPatches({
            nodes,
            edges,
            workflowStartNode,
            outputKey: userFilesInput.key
          });

          const commands: WorkflowCommand[] = [updateChatConfigCommand];
          commands.push(...buildInputUpdateCommands(patches));
          const startNode = runtime.getNode(workflowStartNode.nodeId);
          if (startNode)
            commands.push({
              type: 'updateNode',
              nodeId: startNode.nodeId,
              patch: {
                outputs: startNode.outputs
                  .filter((output) => output.key !== userFilesInput.key)
                  .map((output) => FlowNodeOutputItemTypeSchema.parse(output))
              }
            });
          runtime.dispatch(commands);
        } else {
          runtime.dispatch(updateChatConfigCommand);
        }
      }}
    />
  );
}
