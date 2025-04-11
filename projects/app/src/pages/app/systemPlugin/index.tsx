import AppContainer from '@/pageComponents/account/AppContainer';
import AppListContextProvider, { AppListContext } from '@/pageComponents/app/list/context';
import PluginList from '@/pageComponents/app/list/PluginList';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useContextSelector } from 'use-context-selector';

const SystemPlugin = () => {
  const { plugins, pluginGroups } = useContextSelector(AppListContext, (v) => v);

  return (
    <AppContainer>
      <PluginList plugins={plugins} pluginGroups={pluginGroups} />
    </AppContainer>
  );
};

function ContextRender() {
  return (
    <AppListContextProvider>
      <SystemPlugin />
    </AppListContextProvider>
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
