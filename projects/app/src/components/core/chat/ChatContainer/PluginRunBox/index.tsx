import React from 'react';
import { PluginRunBoxTabEnum } from './constants';
import { type PluginRunBoxProps } from './type';
import RenderInput from './components/RenderInput';
import PluginRunContextProvider from './context';
import { useContextSelector } from 'use-context-selector';
import RenderOutput from './components/RenderOutput';
import RenderResponseDetail from './components/RenderResponseDetail';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

export const PluginRunBoxContent = ({ showTab }: { showTab?: PluginRunBoxTabEnum }) => {
  const tab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const formatTab = showTab || tab;

  return (
    <>
      {formatTab === PluginRunBoxTabEnum.input && <RenderInput />}
      {formatTab === PluginRunBoxTabEnum.output && <RenderOutput />}
      {formatTab === PluginRunBoxTabEnum.detail && <RenderResponseDetail />}
    </>
  );
};

const PluginRunBox = (props: PluginRunBoxProps) => {
  return (
    <PluginRunContextProvider {...props}>
      <PluginRunBoxContent showTab={props.showTab} />
    </PluginRunContextProvider>
  );
};

export default PluginRunBox;
