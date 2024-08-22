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
  const [, startTst] = useTransition();
  const saveSnapshot = useContextSelector(WorkflowContext, (v) => v.saveSnapshot);

  return (
    <Box className="nodrag">
      <WelcomeTextConfig
        resize={'both'}
        value={welcomeText}
        onChange={(e) => {
          startTst(() => {
            setAppDetail((state) => {
              saveSnapshot({
                chatConfig: {
                  ...state.chatConfig,
                  welcomeText: e.target.value
                }
              });

              return {
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  welcomeText: e.target.value
                }
              };
            });
          });
        }}
      />
    </Box>
  );
}

function ChatStartVariable({ chatConfig: { variables = [] }, setAppDetail }: ComponentProps) {
  const [, startTst] = useTransition();
  const saveSnapshot = useContextSelector(WorkflowContext, (v) => v.saveSnapshot);

  const updateVariables = useMemoizedFn((value: VariableItemType[]) => {
    startTst(() => {
      setAppDetail((state) => {
        saveSnapshot({
          chatConfig: {
            ...state.chatConfig,
            variables: value
          }
        });

        return {
          ...state,
          chatConfig: {
            ...state.chatConfig,
            variables: value
          }
        };
      });
    });
  });

  return <VariableEdit variables={variables} onChange={(e) => updateVariables(e)} />;
}

function QuestionGuide({ chatConfig: { questionGuide = false }, setAppDetail }: ComponentProps) {
  const [, startTst] = useTransition();
  const saveSnapshot = useContextSelector(WorkflowContext, (v) => v.saveSnapshot);

  return (
    <QGSwitch
      isChecked={questionGuide}
      onChange={(e) => {
        const value = e.target.checked;
        startTst(() => {
          setAppDetail((state) => {
            saveSnapshot({
              chatConfig: {
                ...state.chatConfig,
                questionGuide: value
              }
            });

            return {
              ...state,
              chatConfig: {
                ...state.chatConfig,
                questionGuide: value
              }
            };
          });
        });
      }}
    />
  );
}

function TTSGuide({ chatConfig: { ttsConfig }, setAppDetail }: ComponentProps) {
  const [, startTst] = useTransition();
  const saveSnapshot = useContextSelector(WorkflowContext, (v) => v.saveSnapshot);

  return (
    <TTSSelect
      value={ttsConfig}
      onChange={(e) => {
        startTst(() => {
          setAppDetail((state) => {
            saveSnapshot({
              chatConfig: {
                ...state.chatConfig,
                ttsConfig: e
              }
            });

            return {
              ...state,
              chatConfig: {
                ...state.chatConfig,
                ttsConfig: e
              }
            };
          });
        });
      }}
    />
  );
}

function WhisperGuide({ chatConfig: { whisperConfig, ttsConfig }, setAppDetail }: ComponentProps) {
  const [, startTst] = useTransition();
  const saveSnapshot = useContextSelector(WorkflowContext, (v) => v.saveSnapshot);

  return (
    <WhisperConfig
      isOpenAudio={ttsConfig?.type !== TTSTypeEnum.none}
      value={whisperConfig}
      onChange={(e) => {
        startTst(() => {
          setAppDetail((state) => {
            saveSnapshot({
              chatConfig: {
                ...state.chatConfig,
                whisperConfig: e
              }
            });

            return {
              ...state,
              chatConfig: {
                ...state.chatConfig,
                whisperConfig: e
              }
            };
          });
        });
      }}
    />
  );
}

function ScheduledTrigger({
  chatConfig: { scheduledTriggerConfig },
  setAppDetail
}: ComponentProps) {
  const [, startTst] = useTransition();
  // const saveSnapshot = useContextSelector(WorkflowContext, (v) => v.saveSnapshot);

  return (
    <ScheduledTriggerConfig
      value={scheduledTriggerConfig}
      onChange={(e) => {
        startTst(() => {
          setAppDetail((state) => {
            // saveSnapshot({
            //   chatConfig: {
            //     ...state.chatConfig,
            //     scheduledTriggerConfig: e
            //   }
            // });

            return {
              ...state,
              chatConfig: {
                ...state.chatConfig,
                scheduledTriggerConfig: e
              }
            };
          });
        });
      }}
    />
  );
}

function QuestionInputGuide({ chatConfig: { chatInputGuide }, setAppDetail }: ComponentProps) {
  const [, startTst] = useTransition();
  const appId = useContextSelector(WorkflowContext, (v) => v.appId);
  const saveSnapshot = useContextSelector(WorkflowContext, (v) => v.saveSnapshot);

  return appId ? (
    <InputGuideConfig
      appId={appId}
      value={chatInputGuide}
      onChange={(e) => {
        startTst(() => {
          setAppDetail((state) => {
            saveSnapshot({
              chatConfig: {
                ...state.chatConfig,
                chatInputGuide: e
              }
            });

            return {
              ...state,
              chatConfig: {
                ...state.chatConfig,
                chatInputGuide: e
              }
            };
          });
        });
      }}
    />
  ) : null;
}

function FileSelectConfig({ chatConfig: { fileSelectConfig }, setAppDetail }: ComponentProps) {
  const [, startTst] = useTransition();
  const saveSnapshot = useContextSelector(WorkflowContext, (v) => v.saveSnapshot);

  return (
    <FileSelect
      value={fileSelectConfig}
      onChange={(e) => {
        startTst(() => {
          setAppDetail((state) => {
            saveSnapshot({
              chatConfig: {
                ...state.chatConfig,
                fileSelectConfig: e
              }
            });

            return {
              ...state,
              chatConfig: {
                ...state.chatConfig,
                fileSelectConfig: e
              }
            };
          });
        });
      }}
    />
  );
}
