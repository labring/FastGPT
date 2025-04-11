import PluginCard from '@/pageComponents/toolkit/PluginCard';
import { Grid } from '@chakra-ui/react';
import { AppGroupEnum } from '@fastgpt/global/core/app/constants';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';

const PluginList = ({
  plugins,
  pluginGroups
}: {
  plugins: NodeTemplateListItemType[];
  pluginGroups: PluginGroupSchemaType[];
}) => {
  const { searchKey } = useContextSelector(AppListContext, (v) => v);
  const router = useRouter();

  const selectedGroup = useMemo(() => {
    return router.pathname.split('/').pop() as AppGroupEnum;
  }, [router.pathname]);

  const selectedType = useMemo(() => {
    return router.query.type as string;
  }, [router.query.type]);

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
  );
};

export default PluginList;
