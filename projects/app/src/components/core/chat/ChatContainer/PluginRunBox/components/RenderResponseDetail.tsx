import { ResponseBox } from '../../../components/WholeResponseModal';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';

const RenderResponseDetail = () => {
  const { histories, isChatting } = useContextSelector(PluginRunContext, (v) => v);

  const responseData = histories?.[1]?.responseData || [];

  return isChatting ? '进行中' : <ResponseBox response={responseData} showDetail={true} />;
};

export default RenderResponseDetail;
