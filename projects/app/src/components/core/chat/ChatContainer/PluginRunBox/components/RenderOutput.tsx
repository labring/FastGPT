import { Box } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import Markdown from '@/components/Markdown';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import AIResponseBox from '../../../components/AIResponseBox';

const RenderOutput = () => {
  const { histories, isChatting } = useContextSelector(PluginRunContext, (v) => v);

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
            流输出
          </Box>
          {histories.length > 0 && histories[1]?.value.length > 0 ? (
            <Box mt={2}>
              {histories[1].value.map((value, i) => {
                const key = `${histories[1].dataId}-ai-${i}`;
                return (
                  <AIResponseBox
                    key={key}
                    value={value}
                    index={i}
                    chat={histories[1]}
                    isLastChild={true}
                    isChatting={isChatting}
                    questionGuides={[]}
                  />
                );
              })}
            </Box>
          ) : null}
        </Box>
      </Box>
      <Box border={'base'} mt={4} rounded={'md'} bg={'myGray.25'}>
        <Box p={4} color={'myGray.900'} fontWeight={'bold'}>
          <Box>插件输出</Box>
          {histories.length > 0 && histories[1].responseData ? (
            <Markdown source={`~~~json\n${pluginOutputs}`} />
          ) : null}
        </Box>
      </Box>
    </>
  );
};

export default RenderOutput;
