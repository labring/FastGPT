import { Box } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import Markdown from '@/components/Markdown';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import AIResponseBox from '../../../components/AIResponseBox';
import { useTranslation } from 'next-i18next';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
const RenderOutput = () => {
  const { t } = useTranslation();

  const histories = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const isChatting = useContextSelector(PluginRunContext, (v) => v.isChatting);

  const pluginOutputs = useMemo(() => {
    const pluginOutputs = histories?.[1]?.responseData?.find(
      (item) => item.moduleType === FlowNodeTypeEnum.pluginOutput
    )?.pluginOutput;

    return JSON.stringify(pluginOutputs, null, 2);
  }, [histories]);

  return (
    <>
      <Box border={'base'} rounded={'md'} bg={'myGray.25'}>
        <Box p={4} color={'myGray.900'}>
          <Box color={'myGray.900'} fontWeight={'bold'}>
            {t('chat:stream_output')}
          </Box>
          {histories.length > 0 && histories[1]?.value.length > 0 ? (
            <Box mt={2}>
              {histories[1].value.map((value, i) => {
                const key = `${histories[1].dataId}-ai-${i}`;
                return (
                  <AIResponseBox
                    key={key}
                    value={value}
                    isLastResponseValue={true}
                    isChatting={isChatting}
                  />
                );
              })}
            </Box>
          ) : null}
        </Box>
      </Box>
      <Box border={'base'} mt={4} rounded={'md'} bg={'myGray.25'}>
        <Box p={4} color={'myGray.900'} fontWeight={'bold'}>
          <Box>{t('chat:plugins_output')}</Box>
          {histories.length > 0 && histories[1].responseData ? (
            <Markdown source={`~~~json\n${pluginOutputs}`} />
          ) : null}
        </Box>
      </Box>
      <ComplianceTip type={'chat'} />
    </>
  );
};

export default RenderOutput;
