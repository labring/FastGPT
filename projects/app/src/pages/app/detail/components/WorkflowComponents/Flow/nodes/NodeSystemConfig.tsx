import React, { Dispatch, useMemo } from 'react';
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
import Container from '../components/Container';

type ComponentProps = {
  chatConfig: AppChatConfigType;
  setAppDetail: Dispatch<React.SetStateAction<AppDetailType>>;
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
  }, [data, appDetail]);

  const componentsProps = useMemo(
    () => ({
      chatConfig,
      setAppDetail
    }),
    [chatConfig, setAppDetail]
  );

  const Render = useMemo(() => {
    return (
      <>
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
            <WelcomeText {...componentsProps} />
            <Box mt={2} pt={2}>
              <ChatStartVariable {...componentsProps} />
            </Box>
            <Box mt={3} pt={3} borderTop={'base'} borderColor={'myGray.200'}>
              <FileSelectConfig {...componentsProps} />
            </Box>
            <Box mt={3} pt={3} borderTop={'base'} borderColor={'myGray.200'}>
              <TTSGuide {...componentsProps} />
            </Box>
            <Box mt={3} pt={3} borderTop={'base'} borderColor={'myGray.200'}>
              <WhisperGuide {...componentsProps} />
            </Box>
            <Box mt={3} pt={4} borderTop={'base'} borderColor={'myGray.200'}>
              <QuestionGuide {...componentsProps} />
            </Box>
            <Box mt={4} pt={3} borderTop={'base'} borderColor={'myGray.200'}>
              <ScheduledTrigger {...componentsProps} />
            </Box>
            <Box mt={3} pt={3} borderTop={'base'} borderColor={'myGray.200'}>
              <QuestionInputGuide {...componentsProps} />
            </Box>
          </Container>
        </NodeCard>
      </>
    );
  }, [componentsProps, data, selected]);

  return Render;
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
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const workflowStartNode = nodeList.find(
    (item) => item.flowNodeType === FlowNodeTypeEnum.workflowStart
  )!;

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
        const repeatKey = workflowStartNode?.outputs.find(
          (item) => item.key === userFilesInput.key
        );
        if (canUploadFiles) {
          !repeatKey &&
            onChangeNode({
              nodeId: workflowStartNode.nodeId,
              type: 'addOutput',
              value: userFilesInput
            });
        } else {
          repeatKey &&
            onChangeNode({
              nodeId: workflowStartNode.nodeId,
              type: 'delOutput',
              key: userFilesInput.key
            });
        }
      }}
    />
  );
}
