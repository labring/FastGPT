import { type PluginRunBoxProps } from '@/components/core/chat/ChatContainer/PluginRunBox/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import React, { useEffect } from 'react';
import { PluginRunBoxContent } from '@/components/core/chat/ChatContainer/PluginRunBox';
import PluginRunContextProvider from '@/components/core/chat/ChatContainer/PluginRunBox/context';
import { Box, Grid, Stack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useContextSelector } from 'use-context-selector';

const CustomPluginRunBox = (props: PluginRunBoxProps) => {
  const { isPc } = useSystem();
  const { t } = useTranslation();

  const tab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const setTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);

  useEffect(() => {
    if (isPc && tab === PluginRunBoxTabEnum.input) {
      setTab(PluginRunBoxTabEnum.output);
    }
  }, [isPc, setTab, tab]);

  return (
    // PC 双栏与移动端共用单一 Provider，避免左右分栏各建一条恢复流或各自持有中断控制器。
    <PluginRunContextProvider {...props}>
      {isPc ? (
        <Grid gridTemplateColumns={'450px 1fr'} h={'100%'} minH={0} minW={0}>
          <Box
            px={3}
            py={4}
            borderRight={'base'}
            h={'100%'}
            minH={0}
            minW={0}
            overflowY={'auto'}
            w={'100%'}
          >
            <Box color={'myGray.900'} pb={5}>
              {t('common:Input')}
            </Box>
            <PluginRunBoxContent showTab={PluginRunBoxTabEnum.input} />
          </Box>
          <Stack
            px={3}
            py={4}
            h={'100%'}
            minH={0}
            minW={0}
            alignItems={'flex-start'}
            w={'100%'}
            overflow={'hidden'}
          >
            <Box display={'inline-block'}>
              <LightRowTabs<PluginRunBoxTabEnum>
                list={[
                  { label: t('common:Output'), value: PluginRunBoxTabEnum.output },
                  { label: t('common:all_result'), value: PluginRunBoxTabEnum.detail }
                ]}
                value={tab}
                onChange={setTab}
                inlineStyles={{ px: 0.5, pt: 0 }}
                outerPadding="4px"
                outerHeight="40px"
                itemHeight="32px"
                gap={5}
                py={0}
                fontSize={'sm'}
              />
            </Box>
            <Box flex={'1 0 0'} minH={0} minW={0} overflowY={'auto'} w={'100%'}>
              <PluginRunBoxContent />
            </Box>
          </Stack>
        </Grid>
      ) : (
        <Stack pt={2} h={'100%'} minH={0} minW={0} overflow={'hidden'}>
          <Box px={4}>
            <LightRowTabs<PluginRunBoxTabEnum>
              list={[
                { label: t('common:Input'), value: PluginRunBoxTabEnum.input },
                { label: t('common:Output'), value: PluginRunBoxTabEnum.output },
                { label: t('common:all_result'), value: PluginRunBoxTabEnum.detail }
              ]}
              value={tab}
              onChange={setTab}
              inlineStyles={{ px: 0.5, pt: 0 }}
              outerPadding="4px"
              outerHeight="40px"
              itemHeight="32px"
              gap={5}
              py={0}
              fontSize={'sm'}
            />
          </Box>
          <Box flex={'1 0 0'} minH={0} minW={0} overflowY={'auto'} w={'100%'}>
            <Box px={4} pb={2}>
              <PluginRunBoxContent />
            </Box>
          </Box>
        </Stack>
      )}
    </PluginRunContextProvider>
  );
};

export default React.memo(CustomPluginRunBox);
