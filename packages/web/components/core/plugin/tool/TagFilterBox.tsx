import { Box, Flex, Menu, MenuButton, MenuItem, MenuList, Portal } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';
import React, { useMemo } from 'react';
import MyIcon from '../../../common/Icon';

export type MarketplaceSourceFilterValue = 'official' | 'community';

const ToolTagFilterBox = ({
  tags,
  selectedTagIds,
  onTagSelect,
  selectedSource,
  onSourceSelect,
  size = 'base',
  variant = 'default'
}: {
  tags: SystemPluginToolTagType[];
  selectedTagIds: string[];
  onTagSelect: (tagIds: string[]) => void;
  selectedSource?: MarketplaceSourceFilterValue;
  onSourceSelect?: (source?: MarketplaceSourceFilterValue) => void;
  size?: 'base' | 'sm';
  variant?: 'default' | 'marketplace';
}) => {
  const { t, i18n } = useTranslation();
  const isMarketplaceVariant = variant === 'marketplace';
  const sourceOptions = [
    { label: t('common:All'), value: undefined },
    { label: t('app:toolkit_official'), value: 'official' },
    { label: t('app:toolkit_community'), value: 'community' }
  ] as const;
  const selectedSourceLabel =
    sourceOptions.find((option) => option.value === selectedSource)?.label || t('common:All');

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagSelect(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagSelect([...selectedTagIds, tagId]);
    }
  };

  const tagBaseStyles = useMemo(() => {
    const sizeStyles = {
      base: isMarketplaceVariant
        ? {
            px: '13px',
            h: '35px',
            fontSize: '14px',
            lineHeight: '21px'
          }
        : {
            px: 3,
            py: 1.5,
            fontSize: 'sm'
          },
      sm: {
        px: 2,
        py: 1,
        fontSize: 'xs'
      }
    };

    return {
      ...sizeStyles[size],
      fontWeight: 'medium',
      color: isMarketplaceVariant ? '#383F50' : 'myGray.700',
      border: '1px solid',
      borderColor: isMarketplaceVariant ? '#E8EBF0' : 'myGray.200',
      whiteSpace: 'nowrap',
      flexShrink: 0,
      cursor: 'pointer',
      ...(isMarketplaceVariant
        ? {
            alignItems: 'center',
            justifyContent: 'center'
          }
        : {})
    };
  }, [isMarketplaceVariant, size]);

  return (
    <Flex
      alignItems={'center'}
      userSelect={'none'}
      overflow={'auto'}
      pb={1}
      css={{
        '&:hover': {
          overflow: 'auto',
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '3px',
            visibility: 'visible'
          }
        },
        '&::-webkit-scrollbar': {
          marginTop: '2px',
          height: '6px'
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent'
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(0, 0, 0, 0)',
          borderRadius: '3px',
          visibility: 'hidden'
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(0, 0, 0, 0.3)'
        }
      }}
    >
      {isMarketplaceVariant ? (
        <Menu placement="bottom-start" autoSelect={false} isLazy>
          <MenuButton
            as={Box}
            {...tagBaseStyles}
            display={'inline-block'}
            w={'65px'}
            rounded={'6px'}
            bg={'white'}
            position={'relative'}
            _hover={{ bg: 'myGray.50' }}
            _expanded={{ bg: 'myGray.50' }}
          >
            <Box
              position={'absolute'}
              left={'13px'}
              top={'7px'}
              h={'21px'}
              lineHeight={'21px'}
              whiteSpace={'nowrap'}
            >
              {selectedSourceLabel}
            </Box>
            <Box
              position={'absolute'}
              left={'45px'}
              top={'10.5px'}
              w={'7px'}
              h={'14px'}
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              overflow={'visible'}
            >
              <MyIcon
                name={'core/chat/chevronSelector'}
                w={'14px'}
                h={'14px'}
                color={'#667085'}
                verticalAlign={'middle'}
              />
            </Box>
          </MenuButton>
          <Portal>
            <MenuList
              minW={'92px'}
              p={'6px'}
              border={'1px solid'}
              borderColor={'#E8EBF0'}
              boxShadow={'3'}
              zIndex={2000}
            >
              {sourceOptions.map((option) => {
                const isSelected = option.value === selectedSource;

                return (
                  <MenuItem
                    key={option.value ?? 'all'}
                    h={'32px'}
                    borderRadius={'6px'}
                    fontSize={'14px'}
                    fontWeight={'medium'}
                    color={isSelected ? 'primary.600' : '#383F50'}
                    bg={isSelected ? 'myGray.50' : 'white'}
                    _hover={{ bg: 'myGray.50' }}
                    onClick={() => onSourceSelect?.(option.value)}
                  >
                    <Box flex={1}>{option.label}</Box>
                    {isSelected && <MyIcon name={'common/check'} w={4} color={'primary.600'} />}
                  </MenuItem>
                );
              })}
            </MenuList>
          </Portal>
        </Menu>
      ) : (
        <Box
          {...tagBaseStyles}
          rounded={'sm'}
          bg={selectedTagIds.length === 0 ? 'myGray.150' : 'transparent'}
          onClick={() => onTagSelect([])}
        >
          {t('common:All')}
        </Box>
      )}
      <Box
        mx={2}
        h={'20px'}
        w={'1px'}
        bg={isMarketplaceVariant ? '#E8EBF0' : 'myGray.200'}
        flexShrink={0}
      />
      <Box flex={1}>
        <Flex gap={2} flexWrap="nowrap">
          {tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.tagId);
            return (
              <Box
                key={tag.tagId}
                {...tagBaseStyles}
                display={isMarketplaceVariant ? 'inline-flex' : undefined}
                rounded={'full'}
                bg={(() => {
                  if (isMarketplaceVariant) {
                    return isSelected ? 'myGray.50 !important' : 'white';
                  }
                  return isSelected ? 'myGray.150 !important' : 'transparent';
                })()}
                _hover={isMarketplaceVariant ? { bg: 'myGray.50' } : undefined}
                onClick={() => toggleTag(tag.tagId)}
              >
                {t(parseI18nString(tag.tagName, i18n.language))}
              </Box>
            );
          })}
        </Flex>
      </Box>
    </Flex>
  );
};

export default React.memo(ToolTagFilterBox);
