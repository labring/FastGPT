import { Flex } from '@chakra-ui/react';
import { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import {
  SingleSelectFilter,
  type SingleSelectFilterOption
} from '@fastgpt/web/components/common/TagFilter';
import ResourceListFilters from '@/pageComponents/dashboard/agent/filters/ResourceListFilters';
import type { DatasetListFilterType } from '@/pageComponents/dashboard/agent/filters/utils';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';

type Props = {
  value: DatasetListFilterType;
  onChange: (next: DatasetListFilterType) => void;
};

const datasetFilterTypes = [
  DatasetTypeEnum.dataset,
  DatasetTypeEnum.websiteDataset,
  DatasetTypeEnum.apiDataset,
  DatasetTypeEnum.feishu,
  DatasetTypeEnum.yuque,
  DatasetTypeEnum.dingtalk
] as const;

const datasetFilterIconMap: Record<(typeof datasetFilterTypes)[number], IconNameType> = {
  [DatasetTypeEnum.dataset]: 'core/dataset/commonDatasetOutline',
  [DatasetTypeEnum.websiteDataset]: 'core/dataset/websiteDatasetOutline',
  [DatasetTypeEnum.apiDataset]: 'core/dataset/externalDatasetOutline',
  [DatasetTypeEnum.feishu]: 'core/dataset/feishuDatasetOutline',
  [DatasetTypeEnum.yuque]: 'core/dataset/yuqueDatasetOutline',
  [DatasetTypeEnum.dingtalk]: 'core/dataset/dingtalkDatasetOutline'
};

/** 知识库列表的类型、创建者和排序筛选。 */
const DatasetListFilters = ({ value, onChange }: Props) => {
  const { t } = useTranslation();
  const typeOptions = useMemo(
    (): SingleSelectFilterOption<DatasetListFilterType['type']>[] => [
      { value: 'all', label: t('common:All') },
      ...datasetFilterTypes.map((type) => ({
        value: type,
        label: t(DatasetTypeMap[type].label),
        icon: datasetFilterIconMap[type]
      }))
    ],
    [t]
  );

  return (
    <Flex alignItems={'center'} gap={3} minW={0} flexShrink={0}>
      <SingleSelectFilter
        title={t('app:list_filter.type')}
        value={value.type}
        options={typeOptions}
        onChange={(type) => onChange({ ...value, type })}
        maxW={'180px'}
      />
      <ResourceListFilters value={value} onChange={(next) => onChange({ ...value, ...next })} />
    </Flex>
  );
};

export default DatasetListFilters;
