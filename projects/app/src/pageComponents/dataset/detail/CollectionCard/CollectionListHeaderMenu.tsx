import {
  Box,
  Flex,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Portal
} from '@chakra-ui/react';
import { useTranslation, type TFunction } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import { formatTrainingStageText } from '@/web/core/dataset/trainingStatus';

type HeaderParams = Pick<
  GetDatasetCollectionsProps,
  'sortBy' | 'sortOrder' | 'trainingType' | 'statusFilter'
>;
type HeaderOption = { value: string; label: string; params?: HeaderParams };

const runningStages = [
  [TrainingModeEnum.parse],
  [TrainingModeEnum.imageParse],
  [TrainingModeEnum.qa],
  [TrainingModeEnum.image],
  [TrainingModeEnum.auto],
  [TrainingModeEnum.index, TrainingModeEnum.chunk],
  [TrainingModeEnum.rebuildIndex],
  [TrainingModeEnum.rebuildSynonym]
] satisfies [TrainingModeEnum, ...TrainingModeEnum[]][];

const getColumnOptions = {
  name: (t: TFunction): HeaderOption[] => [
    {
      value: 'asc',
      label: t('dataset:collection_list.name_asc'),
      params: { sortBy: 'name', sortOrder: 'asc' }
    },
    {
      value: 'desc',
      label: t('dataset:collection_list.name_desc'),
      params: { sortBy: 'name', sortOrder: 'desc' }
    }
  ],
  trainingType: (t: TFunction): HeaderOption[] => [
    { value: 'all', label: t('common:All') },
    {
      value: DatasetCollectionDataProcessModeEnum.chunk,
      label: t('common:core.dataset.training.Chunk mode'),
      params: { trainingType: DatasetCollectionDataProcessModeEnum.chunk }
    },
    {
      value: DatasetCollectionDataProcessModeEnum.qa,
      label: t('common:core.dataset.training.QA mode'),
      params: { trainingType: DatasetCollectionDataProcessModeEnum.qa }
    }
  ],
  time: (t: TFunction): HeaderOption[] => [
    { value: 'createTimeAsc', label: t('dataset:collection_list.create_time_asc') },
    {
      value: 'createTimeDesc',
      label: t('dataset:collection_list.create_time_desc'),
      params: { sortBy: 'createTime', sortOrder: 'desc' }
    },
    {
      value: 'updateTimeAsc',
      label: t('dataset:collection_list.update_time_asc'),
      params: { sortBy: 'updateTime', sortOrder: 'asc' }
    },
    {
      value: 'updateTimeDesc',
      label: t('dataset:collection_list.update_time_desc'),
      params: { sortBy: 'updateTime', sortOrder: 'desc' }
    }
  ],
  status: (t: TFunction): HeaderOption[] => [
    { value: 'all', label: t('common:All') },
    {
      value: CollectionTrainingStatusEnum.ready,
      label: t('dataset:process.Is_Ready'),
      params: { statusFilter: { status: CollectionTrainingStatusEnum.ready } }
    },
    {
      value: CollectionTrainingStatusEnum.running,
      label: t('chat:processing'),
      params: { statusFilter: { status: CollectionTrainingStatusEnum.running } }
    },
    {
      value: CollectionTrainingStatusEnum.error,
      label: t('dataset:training.status_error'),
      params: { statusFilter: { status: CollectionTrainingStatusEnum.error } }
    },
    ...runningStages.map((modes) => ({
      value: modes[0],
      label: formatTrainingStageText(modes[0], t),
      params: { statusFilter: { status: CollectionTrainingStatusEnum.running, modes } }
    }))
  ]
};

type Column = keyof typeof getColumnOptions;
export type CollectionListHeaderSelection = { column: Column; value: string; params: HeaderParams };

type Props = {
  column: Column;
  title: string;
  selection: CollectionListHeaderSelection | undefined;
  onChange: (selection: CollectionListHeaderSelection | undefined) => void;
};

/** 以固定列标题打开单选菜单，选项携带该列对应的列表请求参数。 */
const CollectionListHeaderMenu = ({ column, title, selection, onChange }: Props) => {
  const { t } = useTranslation();
  const options = getColumnOptions[column](t);
  const selected = selection?.column === column ? selection.value : undefined;
  const defaultOption = options.find((option) => option.params === undefined);

  return (
    <Menu strategy="fixed" placement="bottom-start" autoSelect={false} isLazy>
      <MenuButton
        type="button"
        color={selected ? 'primary.600' : 'inherit'}
        _hover={{ color: 'primary.600' }}
        borderRadius="sm"
        fontWeight="inherit"
        letterSpacing="inherit"
        textTransform="inherit"
      >
        <Flex as="span" alignItems="center" gap={1} whiteSpace="nowrap">
          {title}
          <MyIcon name="core/chat/chevronDown" w={4} h={4} flexShrink={0} />
        </Flex>
      </MenuButton>
      <Portal>
        <MenuList
          minW="160px"
          w="max-content"
          maxH="50vh"
          overflowY="auto"
          p="6px"
          zIndex="dropdown"
        >
          <MenuOptionGroup type="radio" value={selected ?? defaultOption?.value ?? ''}>
            {options.map((option) => (
              <MenuItemOption
                key={option.value}
                value={option.value}
                icon={null}
                borderRadius="sm"
                py={2}
                px={3}
                fontSize="sm"
                color="myGray.900"
                _checked={{ color: 'primary.600', bg: 'primary.50' }}
                _focus={{ bg: 'myGray.100' }}
                onClick={() => {
                  if (selected === option.value) return;
                  onChange(
                    option.params
                      ? { column, value: option.value, params: option.params }
                      : undefined
                  );
                }}
              >
                <Flex as="span" justifyContent="space-between" gap={4} whiteSpace="nowrap">
                  {option.label}
                  {option === defaultOption && (
                    <Box
                      as="span"
                      color="var(--light-general-on-surface-lowest, var(--chakra-colors-myGray-500))"
                    >
                      {t('dataset:default_params')}
                    </Box>
                  )}
                </Flex>
              </MenuItemOption>
            ))}
          </MenuOptionGroup>
        </MenuList>
      </Portal>
    </Menu>
  );
};

export default CollectionListHeaderMenu;
