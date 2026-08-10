import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import Container from '../../components/Container';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../../../context';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { useMount } from 'ahooks';
import { PluginConfigForm, type PluginConfigFormProps } from './PluginConfigForm';

const NodePluginConfig = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { appDetail, setAppDetail } = useContextSelector(AppContext, (v) => v);

  const chatConfig = useMemo<AppChatConfigType>(() => {
    return getAppChatConfig({
      chatConfig: appDetail.chatConfig,
      systemConfigNode: data,
      isPublicFetch: true
    });
  }, [data, appDetail]);

  useMount(() => {
    setAppDetail((state) => ({
      ...state,
      chatConfig: {
        ...state.chatConfig,
        ...chatConfig
      }
    }));
  });

  const componentsProps = useMemo<PluginConfigFormProps>(
    () => ({
      chatConfig,
      setAppDetail
    }),
    [chatConfig, setAppDetail]
  );

  const Render = useMemo(() => {
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
        <Container w={'360px'}>
          <PluginConfigForm {...componentsProps} />
        </Container>
      </NodeCard>
    );
  }, [componentsProps, data, selected]);

  return Render;
};
export default React.memo(NodePluginConfig);
