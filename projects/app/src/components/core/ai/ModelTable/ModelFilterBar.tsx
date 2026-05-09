import { Box, Flex } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { FilterState, I18nT, ProviderOption } from './types';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/model';

export type ModelFilterBarProps = {
  t: I18nT;
  filterState: FilterState;
  setFilterState: Dispatch<SetStateAction<FilterState>>;
  providerList: ProviderOption[];
  modelTypeList: { label: string; value: ModelTypeEnum | '' }[];
  tabSlot?: ReactNode;
  actionSlot?: ReactNode;
};

const ModelFilterBar = ({
  t,
  filterState,
  setFilterState,
  providerList,
  modelTypeList,
  tabSlot,
  actionSlot
}: ModelFilterBarProps) => {
  return (
    <Flex alignItems={'center'} justifyContent={'space-between'} gap={3}>
      {tabSlot ? <Box flexShrink={0}>{tabSlot}</Box> : <Box />}
      <Flex alignItems={'center'} gap={3}>
        <Box flexShrink={0} minW={'120px'}>
          <MySelect
            w={'100%'}
            h={'36px'}
            bg={'white'}
            value={filterState.provider}
            onChange={(provider) => setFilterState((state) => ({ ...state, provider }))}
            list={providerList}
          />
        </Box>
        {/* <Box flexShrink={0} minW={'100px'}>
          <MySelect
            w={'100%'}
            h={'36px'}
            bg={'white'}
            value={filterState.modelType}
            onChange={(modelType) => setFilterState((state) => ({ ...state, modelType }))}
            list={modelTypeList}
          />
        </Box> */}
        <Box minW={0} maxW={'350px'}>
          <SearchInput
            h={'36px'}
            bg={'white'}
            value={filterState.search}
            onChange={(e) => setFilterState((state) => ({ ...state, search: e.target.value }))}
            placeholder={t('common:model.search_name_placeholder')}
          />
        </Box>
        {actionSlot}
      </Flex>
    </Flex>
  );
};

export default ModelFilterBar;
