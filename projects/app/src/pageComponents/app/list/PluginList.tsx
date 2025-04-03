import PluginCard from '@/pageComponents/toolkit/PluginCard';
import { getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { Grid } from '@chakra-ui/react';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { useMemo, useState } from 'react';

const PluginList = ({
  plugins,
  pluginGroups,
  selectedGroup,
  selectedType,
  searchKey
}: {
  plugins: NodeTemplateListItemType[];
  pluginGroups: PluginGroupSchemaType[];
  selectedGroup: string;
  selectedType: string;
  searchKey: string;
}) => {
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
