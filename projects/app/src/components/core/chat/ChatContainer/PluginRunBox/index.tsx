import React from 'react';
import { PluginRunBoxTabEnum } from './constants';
import { type PluginRunBoxProps } from './type';
import RenderInput from './components/RenderInput';
import PluginRunContextProvider from './context';
import { useContextSelector } from 'use-context-selector';
import RenderOutput from './components/RenderOutput';
import RenderResponseDetail from './components/RenderResponseDetail';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { Box } from '@chakra-ui/react';

const PluginRunBox = (props: PluginRunBoxProps) => {
  const tab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const formatTab = props.showTab || tab;

  return (
    <PluginRunContextProvider {...props}>
      <Box h={'100%'} minH={0} display={'flex'} flexDirection={'column'}>
        {formatTab === PluginRunBoxTabEnum.input && <RenderInput />}
        {formatTab === PluginRunBoxTabEnum.output && <RenderOutput />}
        {formatTab === PluginRunBoxTabEnum.detail && <RenderResponseDetail />}
      </Box>
    </PluginRunContextProvider>
  );
};

export default PluginRunBox;
