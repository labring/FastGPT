import { PluginRunBoxProps } from '@/components/core/chat/ChatContainer/PluginRunBox/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import React, { useEffect } from 'react';
import PluginRunBox from '@/components/core/chat/ChatContainer/PluginRunBox';
import { Box, Grid, Stack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';

const CustomPluginRunBox = (props: PluginRunBoxProps) => {
  const { tab, setTab } = props;
  const { isPc } = useSystem();
  const { t } = useTranslation();

  useEffect(() => {
    if (isPc && tab === PluginRunBoxTabEnum.input) {
      setTab(PluginRunBoxTabEnum.output);
    }
  }, [isPc, setTab, tab]);

  return isPc ? (
    <Grid gridTemplateColumns={'450px 1fr'} h={'100%'}>
      <Box px={3} py={4} borderRight={'base'} h={'100%'} overflowY={'auto'} w={'100%'}>
        <Box color={'myGray.900'} mb={5}>
          {t('common:common.Input')}
        </Box>
        <PluginRunBox {...props} tab={PluginRunBoxTabEnum.input} />
      </Box>
      <Stack px={3} py={4} h={'100%'} alignItems={'flex-start'} w={'100%'} overflow={'auto'}>
        <Box display={'inline-block'}>
          <LightRowTabs<PluginRunBoxTabEnum>
            list={[
              { label: t('common:common.Output'), value: PluginRunBoxTabEnum.output },
              { label: t('common:common.all_result'), value: PluginRunBoxTabEnum.detail }
            ]}
            value={tab}
            onChange={setTab}
            inlineStyles={{ px: 0.5, pt: 0 }}
            gap={5}
            py={0}
            fontSize={'sm'}
          />
        </Box>
        <Box flex={'1 0 0'} overflow={'auto'} w={'100%'}>
          <PluginRunBox {...props} />
        </Box>
      </Stack>
    </Grid>
  ) : (
    <Stack py={2} px={4} h={'100%'}>
      <LightRowTabs<PluginRunBoxTabEnum>
        list={[
          { label: t('common:common.Input'), value: PluginRunBoxTabEnum.input },
          { label: t('common:common.Output'), value: PluginRunBoxTabEnum.output },
          { label: t('common:common.all_result'), value: PluginRunBoxTabEnum.detail }
        ]}
        value={tab}
        onChange={setTab}
        inlineStyles={{ px: 0.5, pt: 0 }}
        gap={5}
        py={0}
        fontSize={'sm'}
      />
      <Box flex={'1 0 0'} w={'100%'}>
        <PluginRunBox {...props} />
      </Box>
    </Stack>
  );
};

export default React.memo(CustomPluginRunBox);
