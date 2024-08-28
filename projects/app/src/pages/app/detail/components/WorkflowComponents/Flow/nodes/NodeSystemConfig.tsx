import React, { Dispatch, useMemo, useTransition } from 'react';
import { NodeProps } from 'reactflow';
import { Box } from '@chakra-ui/react';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';

import QGSwitch from '@/components/core/app/QGSwitch';
import TTSSelect from '@/components/core/app/TTSSelect';
import WhisperConfig from '@/components/core/app/WhisperConfig';
import InputGuideConfig from '@/components/core/app/InputGuideConfig';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { TTSTypeEnum } from '@/web/core/app/constants';
import NodeCard from './render/NodeCard';
import ScheduledTriggerConfig from '@/components/core/app/ScheduledTriggerConfig';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { AppChatConfigType, AppDetailType, VariableItemType } from '@fastgpt/global/core/app/type';
import { useMemoizedFn } from 'ahooks';
import VariableEdit from '@/components/core/app/VariableEdit';
import { AppContext } from '@/pages/app/detail/components/context';
import WelcomeTextConfig from '@/components/core/app/WelcomeTextConfig';
import FileSelect from '@/components/core/app/FileSelect';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/system/workflowStart';

type ComponentProps = {
  chatConfig: AppChatConfigType;
  setAppDetail: Dispatch<React.SetStateAction<AppDetailType>>;
};

const NodeUserGuide = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { appDetail, setAppDetail } = useContextSelector(AppContext, (v) => v);

  const chatConfig = useMemo<AppChatConfigType>(() => {
    return getAppChatConfig({
      chatConfig: appDetail.chatConfig,
      systemConfigNode: data,
      isPublicFetch: true
    });
  }, [data, appDetail]);

  const componentsProps = useMemo(
    () => ({
      chatConfig,
      setAppDetail
    }),
    [chatConfig, setAppDetail]
  );

  return (
    <>
      <NodeCard
        minW={'300px'}
        selected={selected}
        menuForbid={{
          debug: true,
          rename: true,
          copy: true,
          delete: true
        }}
        {...data}
      >
        <Box px={4} py={'10px'} position={'relative'} borderRadius={'md'} className="nodrag">
          <WelcomeText {...componentsProps} />
          <Box pt={4}>
            <ChatStartVariable {...componentsProps} />
          </Box>
          <Box mt={3} pt={3} borderTop={'base'}>
            <FileSelectConfig {...componentsProps} />
          </Box>
          <Box mt={3} pt={3} borderTop={'base'}>
            <TTSGuide {...componentsProps} />
          </Box>
          <Box mt={3} pt={3} borderTop={'base'}>
            <WhisperGuide {...componentsProps} />
          </Box>
          <Box mt={3} pt={3} borderTop={'base'}>
            <QuestionGuide {...componentsProps} />
          </Box>
          <Box mt={3} pt={3} borderTop={'base'}>
            <ScheduledTrigger {...componentsProps} />
          </Box>
          <Box mt={3} pt={3} borderTop={'base'}>
            <QuestionInputGuide {...componentsProps} />
          </Box>
        </Box>
      </NodeCard>
    </>
  );
};

export default React.memo(NodeUserGuide);

function WelcomeText({ chatConfig: { welcomeText }, setAppDetail }: ComponentProps) {
  return (
    <Box className="nodrag">
      <WelcomeTextConfig
        resize={'both'}
        value={welcomeText}
        onChange={(e) => {
          setAppDetail((state) => ({
            ...state,
            chatConfig: {
              ...state.chatConfig,
              welcomeText: e.target.value
            }
          }));
        }}
      />
    </Box>
  );
}

function ChatStartVariable({ chatConfig: { variables = [] }, setAppDetail }: ComponentProps) {
  const updateVariables = useMemoizedFn((value: VariableItemType[]) => {
    setAppDetail((state) => ({
      ...state,
      chatConfig: {
        ...state.chatConfig,
        variables: value
      }
    }));
  });

  return <VariableEdit variables={variables} onChange={(e) => updateVariables(e)} />;
}

function QuestionGuide({ chatConfig: { questionGuide = false }, setAppDetail }: ComponentProps) {
  return (
    <QGSwitch
      isChecked={questionGuide}
      onChange={(e) => {
        const value = e.target.checked;
        setAppDetail((state) => ({
          ...state,
          chatConfig: {
            ...state.chatConfig,
            questionGuide: value
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
  const appId = useContextSelector(WorkflowContext, (v) => v.appId);
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
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodes = useContextSelector(WorkflowContext, (v) => v.nodes);
  const workflowStartNode = nodes.find((item) => item.type === FlowNodeTypeEnum.workflowStart)!;

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
        const canUploadFiles = e.canSelectFile || e.canSelectImg;
        const repeatKey = workflowStartNode?.data.outputs.find(
          (item) => item.key === userFilesInput.key
        );
        if (canUploadFiles) {
          !repeatKey &&
            onChangeNode({
              nodeId: workflowStartNode.id,
              type: 'addOutput',
              value: userFilesInput
            });
        } else {
          repeatKey &&
            onChangeNode({
              nodeId: workflowStartNode.id,
              type: 'delOutput',
              key: userFilesInput.key
            });
        }
      }}
    />
  );
}
