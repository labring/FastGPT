import { ResponseBox } from '../../../components/WholeResponseModal';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
const RenderResponseDetail = () => {
  const { histories, isChatting } = useContextSelector(PluginRunContext, (v) => v);
  const { t } = useTranslation();
  const responseData = histories?.[1]?.responseData || [];

  return isChatting ? (
    <>{t('chat:in_progress')}</>
  ) : (
    <Box flex={'1 0 0'} h={'100%'} overflow={'auto'}>
      <ResponseBox useMobile={true} response={responseData} />
    </Box>
  );
};

export default RenderResponseDetail;
