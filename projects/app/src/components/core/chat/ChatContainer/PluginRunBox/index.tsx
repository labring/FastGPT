import React from 'react';
import { Box } from '@chakra-ui/react';
import { PluginRunBoxTabEnum } from './constants';
import { type PluginRunBoxProps } from './type';
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
      <Box display={formatTab === PluginRunBoxTabEnum.input ? 'block' : 'none'}>
        <RenderInput />
      </Box>
      <Box display={formatTab === PluginRunBoxTabEnum.output ? 'block' : 'none'}>
        <RenderOutput />
      </Box>
      <Box display={formatTab === PluginRunBoxTabEnum.detail ? 'block' : 'none'}>
        <RenderResponseDetail />
      </Box>
    </PluginRunContextProvider>
  );
};

export default PluginRunBox;
