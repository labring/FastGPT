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
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

const RenderOutput = () => {
  const { t } = useTranslation();

  const histories = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const isChatting = useContextSelector(PluginRunContext, (v) => v.isChatting);
  const aiRecord = useMemo(
    () => [...histories].reverse().find((item) => item.obj === ChatRoleEnum.AI),
    [histories]
  );

  const pluginOutputs = useMemo(() => {
    const pluginOutputs = aiRecord?.responseData?.find(
      (item) => item.moduleType === FlowNodeTypeEnum.pluginOutput
    )?.pluginOutput;

    return JSON.stringify(pluginOutputs, null, 2);
  }, [aiRecord]);

  return (
    <>
      <Box border={'base'} rounded={'md'} bg={'myGray.25'}>
        <Box p={4} color={'myGray.900'}>
          <Box color={'myGray.900'} fontWeight={'bold'}>
            {t('chat:stream_output')}
          </Box>
          {aiRecord && aiRecord.value.length > 0 ? (
            <Box mt={2}>
              {aiRecord.value.map((value, i) => {
                const key = `${aiRecord.dataId}-ai-${i}`;
                return (
                  <AIResponseBox
                    chatItemDataId={aiRecord.dataId}
                    key={key}
                    value={value as AIChatItemValueItemType}
                    isLastResponseValue={true}
                    isLastChild={true}
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
          {aiRecord?.responseData ? <Markdown source={`~~~json\n${pluginOutputs}`} /> : null}
        </Box>
      </Box>
      <ComplianceTip type={'chat'} />
    </>
  );
};

export default RenderOutput;
