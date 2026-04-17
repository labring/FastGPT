import { Box, Flex, HStack } from '@chakra-ui/react';
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
};

const ModelFilterBar = ({
  t,
  filterState,
  setFilterState,
  providerList,
  modelTypeList,
  tabSlot
}: ModelFilterBarProps) => {
  return (
    <Flex alignItems={'center'} justifyContent={'space-between'} gap={3} wrap={'wrap'} mb={5}>
      {tabSlot ? <Box flexShrink={0}>{tabSlot}</Box> : <Box />}

      <Flex alignItems={'center'} justifyContent={'flex-end'} gap={6} wrap={'wrap'} flex={1}>
        <HStack flexShrink={0}>
          <Box fontSize={'sm'} color={'myGray.900'}>
            {t('common:model.provider')}
          </Box>
          <MySelect
            w={'200px'}
            bg={'myGray.50'}
            value={filterState.provider}
            onChange={(provider) => setFilterState((state) => ({ ...state, provider }))}
            list={providerList}
          />
        </HStack>
        <HStack flexShrink={0}>
          <Box fontSize={'sm'} color={'myGray.900'}>
            {t('common:model.model_type')}
          </Box>
          <MySelect
            w={'150px'}
            bg={'myGray.50'}
            value={filterState.modelType}
            onChange={(modelType) => setFilterState((state) => ({ ...state, modelType }))}
            list={modelTypeList}
          />
        </HStack>
        <Box w={'250px'} maxW={'100%'}>
          <SearchInput
            bg={'myGray.50'}
            value={filterState.search}
            onChange={(e) => setFilterState((state) => ({ ...state, search: e.target.value }))}
            placeholder={t('common:model.search_name_placeholder')}
          />
        </Box>
      </Flex>
    </Flex>
  );
};

export default ModelFilterBar;
