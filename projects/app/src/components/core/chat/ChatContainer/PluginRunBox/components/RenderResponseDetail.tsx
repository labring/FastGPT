import { ResponseBox } from '../../../components/WholeResponseModal';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { Box } from '@chakra-ui/react';

const RenderResponseDetail = () => {
  const { histories, isChatting } = useContextSelector(PluginRunContext, (v) => v);

  const responseData = histories?.[1]?.responseData || [];

  return isChatting ? (
    <>{'进行中'}</>
  ) : (
    <Box flex={'1 0 0'} h={'100%'} overflow={'auto'}>
      <ResponseBox useMobile={true} response={responseData} showDetail={true} />
    </Box>
  );
};

export default RenderResponseDetail;
