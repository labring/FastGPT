import React from 'react';
import { PluginRunBoxTabEnum } from './constants';
import { PluginRunBoxProps } from './type';
import RenderInput from './components/RenderInput';
import PluginRunContextProvider from './context';
import { useContextSelector } from 'use-context-selector';
import RenderOutput from './components/RenderOutput';
import RenderResponseDetail from './components/RenderResponseDetail';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

const PluginRunBox = (props: PluginRunBoxProps) => {
  const tab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const formatTab = props.showTab || tab;

  return (
    <PluginRunContextProvider {...props}>
      {formatTab === PluginRunBoxTabEnum.input && <RenderInput />}
      {formatTab === PluginRunBoxTabEnum.output && <RenderOutput />}
      {formatTab === PluginRunBoxTabEnum.detail && <RenderResponseDetail />}
    </PluginRunContextProvider>
  );
};

export default PluginRunBox;
