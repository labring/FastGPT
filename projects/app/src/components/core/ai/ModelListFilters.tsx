import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { modelTypeList } from '@fastgpt/global/core/ai/constants';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/provider';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { SingleSelectFilter } from '@fastgpt/web/components/common/TagFilter';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useMemo } from 'react';

type ModelListFiltersProps = {
  providers: ModelProviderItemType[];
  models: ReadonlyArray<{ provider: string }>;
  provider: string;
  onProviderChange: (provider: string) => void;
  modelType: ModelTypeEnum | '';
  onModelTypeChange: (modelType: ModelTypeEnum | '') => void;
  search: string;
  onSearchChange: (search: string) => void;
  px?: FlexProps['px'];
};

/**
 * 账号与管理员模型列表共用的筛选栏，统一提供商、模型类型和模型名称搜索交互。
 * 提供商选项只展示当前列表实际包含的提供商，避免选中后得到必然为空的结果。
 */
const ModelListFilters = ({
  providers,
  models,
  provider,
  onProviderChange,
  modelType,
  onModelTypeChange,
  search,
  onSearchChange,
  px
}: ModelListFiltersProps) => {
  const { t } = useClientTranslation();

  const providerOptions = useMemo(() => {
    const availableProviderIdSet = new Set(models.map((model) => model.provider));

    return [
      { label: t('common:All'), value: '' },
      ...providers
        .filter((item) => availableProviderIdSet.has(item.id))
        .map((item) => ({
          label: item.name,
          avatar: item.avatar,
          value: item.id
        }))
    ];
  }, [models, providers, t]);

  const modelTypeOptions = useMemo(
    () => [
      { label: t('common:All'), value: '' as const },
      ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
    ],
    [t]
  );

  return (
    <Flex px={px} flexDirection={['column', 'row']} gap={2} alignItems={['stretch', 'flex-start']}>
      <Box w={'100%'} maxW={['100%', '200px']} flex={['none', '0 0 200px']} flexShrink={0}>
        <SearchInput
          bg={'white'}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('common:model.search_name_placeholder')}
        />
      </Box>
      <SingleSelectFilter
        title={t('common:model.provider')}
        value={provider}
        options={providerOptions}
        onChange={onProviderChange}
        listMaxH={'240px'}
        maxW={'240px'}
      />
      <SingleSelectFilter
        title={t('common:model.model_type')}
        value={modelType}
        options={modelTypeOptions}
        onChange={onModelTypeChange}
      />
    </Flex>
  );
};

export default ModelListFilters;
