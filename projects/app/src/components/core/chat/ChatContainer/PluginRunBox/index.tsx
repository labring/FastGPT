import React from 'react';
import { PluginRunBoxTabEnum } from './constants';
import { PluginRunBoxProps } from './type';
import RenderInput from './components/RenderInput';
import PluginRunContextProvider, { PluginRunContext } from './context';
import { useContextSelector } from 'use-context-selector';
import RenderOutput from './components/RenderOutput';
import RenderResponseDetail from './components/RenderResponseDetail';

const PluginRunBox = () => {
  const { tab } = useContextSelector(PluginRunContext, (v) => v);

  return (
    <>
      {tab === PluginRunBoxTabEnum.input && <RenderInput />}
      {tab === PluginRunBoxTabEnum.output && <RenderOutput />}
      {tab === PluginRunBoxTabEnum.detail && <RenderResponseDetail />}
    </>
  );
};

const Render = (props: PluginRunBoxProps) => {
  return (
    <PluginRunContextProvider {...props}>
      <PluginRunBox />
    </PluginRunContextProvider>
  );
};

export default Render;
