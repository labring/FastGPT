import AppContainer from '@/pageComponents/account/AppContainer';
import StudioContextProvider, { StudioContext } from '@/pageComponents/app/context';
import SystemPluginContextProvider, {
  SystemPluginContext
} from '@/pageComponents/app/systemPlugin/context';
import PluginCard from '@/pageComponents/toolkit/PluginCard';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { Grid } from '@chakra-ui/react';
import { AppGroupEnum } from '@fastgpt/global/core/app/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';

const SystemPlugin = () => {
  const router = useRouter();

  const { pluginGroups, searchKey } = useContextSelector(StudioContext, (v) => v);
  const { plugins } = useContextSelector(SystemPluginContext, (v) => v);

  const { selectedGroup = AppGroupEnum.systemPlugin, selectedType } = useMemo(() => {
    return {
      selectedGroup: router.query.groupId as string,
      selectedType: router.query.type as string
    };
  }, [router.query.groupId, router.query.type]);

  const pluginGroupTypes = useMemo(() => {
    const allTypes = [
      {
        typeId: 'all',
        typeName: i18nT('common:common.All')
      }
    ];
    const currentTypes =
      pluginGroups?.find((group) => group.groupId === selectedGroup)?.groupTypes ?? [];

    return [
      ...allTypes,
      ...currentTypes.filter((type) =>
        plugins.find((plugin) => plugin.templateType === type.typeId)
      )
    ];
  }, [pluginGroups, plugins, selectedGroup]);

  const currentPlugins = useMemo(() => {
    const typeArray = pluginGroupTypes?.map((type) => type.typeId);
    return plugins
      .filter(
        (plugin) =>
          (selectedType === 'all' && typeArray?.includes(plugin.templateType)) ||
          selectedType === plugin.templateType
      )
      .filter((plugin) => {
        const str = `${plugin.name}${plugin.intro}${plugin.instructions}`;
        const regx = new RegExp(searchKey, 'gi');
        return regx.test(str);
      });
  }, [pluginGroupTypes, plugins, selectedType, searchKey]);

  return (
    <AppContainer>
      <Grid
        gridTemplateColumns={[
          '1fr',
          'repeat(2,1fr)',
          'repeat(2,1fr)',
          'repeat(3,1fr)',
          'repeat(4,1fr)'
        ]}
        gridGap={4}
        alignItems={'stretch'}
        py={5}
      >
        {currentPlugins.map((item) => (
          <PluginCard key={item.id} item={item} groups={pluginGroups} />
        ))}
      </Grid>
    </AppContainer>
  );
};

function ContextRender() {
  return (
    <StudioContextProvider>
      <SystemPluginContextProvider>
        <SystemPlugin />
      </SystemPluginContextProvider>
    </StudioContextProvider>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'user']))
    }
  };
}
