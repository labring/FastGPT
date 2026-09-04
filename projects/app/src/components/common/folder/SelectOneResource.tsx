import React, { useMemo, useState } from 'react';
import { Box, type BoxProps, Flex } from '@chakra-ui/react';
import {
  type GetResourceFolderListProps,
  type GetResourceListItemResponse,
  type ParentIdType
} from '@fastgpt/global/common/parentFolder/type';
import type { PaginationProps, PaginationResponseType } from '@fastgpt/global/openapi/api';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { useTranslation } from 'next-i18next';

export type SelectOneResourceItemType = GetResourceListItemResponse & {
  disabled?: boolean;
};

export type SelectOneResourceServer = (
  data: PaginationProps<GetResourceFolderListProps>,
  cancelToken?: AbortController
) => Promise<PaginationResponseType<SelectOneResourceItemType>>;

type ResourcePathItemType = SelectOneResourceItemType;

const rootId = 'root';

const SelectOneResource = ({
  server,
  value,
  onSelect,
  maxH = ['80vh', '600px'],
  h = '100%',
  selectFolder = false,
  disabledIds = []
}: {
  server: SelectOneResourceServer;
  value?: ParentIdType;
  onSelect: (e?: SelectOneResourceItemType) => any;
  maxH?: BoxProps['maxH'];
  h?: BoxProps['h'];
  selectFolder?: boolean;
  disabledIds?: string[];
}) => {
  const { t } = useTranslation();
  const rootItem = useMemo<ResourcePathItemType>(
    () => ({
      id: rootId,
      avatar: FolderImgUrl,
      name: t('common:root_folder'),
      isFolder: true
    }),
    [t]
  );
  const [path, setPath] = useState<ResourcePathItemType[]>([rootItem]);
  const currentParentId = path[path.length - 1]?.id === rootId ? null : path[path.length - 1]?.id;

  const { data, ScrollData } = useScrollPagination(server, {
    pageSize: 50,
    params: { parentId: currentParentId },
    refreshDeps: [currentParentId],
    showNoMoreTip: false
  });
  const isAutoHeight = h === 'auto';

  const isItemDisabled = (item: SelectOneResourceItemType) =>
    item.disabled || disabledIds.includes(item.id);

  const selectRoot = () => {
    if (selectFolder) {
      onSelect(value === null ? undefined : rootItem);
    }
    setPath([rootItem]);
  };

  const enterFolder = (item: ResourcePathItemType) => {
    setPath((state) => (state[state.length - 1]?.id === item.id ? state : [...state, item]));
  };

  const onClickItem = (item: SelectOneResourceItemType) => {
    if (isItemDisabled(item)) return;

    if (item.isFolder) {
      if (selectFolder) {
        onSelect(item.id === value ? undefined : item);
      } else {
        enterFolder(item);
      }
      return;
    }

    onSelect(item.id === value ? undefined : item);
  };

  const enterFolderFromArrow = (item: SelectOneResourceItemType) => {
    if (!item.isFolder || isItemDisabled(item)) return;
    enterFolder(item);
  };

  return (
    <Box maxH={maxH} h={h} minH={0} display={'flex'} flexDirection={'column'}>
      <Flex alignItems={'center'} gap={1} minH={'20px'} overflowX={'auto'} whiteSpace={'nowrap'}>
        <Box flex={'0 0 auto'} fontSize={'xs'} color={'myGray.600'}>
          {t('common:current_location')}
        </Box>
        {path.map((item, index) => (
          <React.Fragment key={item.id}>
            {index > 0 && <MyIcon name={'common/line'} w={'5px'} color={'myGray.400'} />}
            <Box
              flex={'0 0 auto'}
              px={1.5}
              py={0.5}
              borderRadius={'sm'}
              color={
                selectFolder && item.id === rootId && value === null
                  ? 'primary.600'
                  : index === path.length - 1
                    ? 'myGray.900'
                    : 'myGray.500'
              }
              fontSize={'xs'}
              cursor={'pointer'}
              _hover={{ bg: 'myGray.100', color: 'primary.600' }}
              onClick={() => {
                if (index === 0) {
                  selectRoot();
                  return;
                }
                setPath((state) => state.slice(0, index + 1));
              }}
            >
              {item.name}
            </Box>
          </React.Fragment>
        ))}
      </Flex>

      <ScrollData
        flex={isAutoHeight ? '0 1 auto' : '1 1 0'}
        h={isAutoHeight ? 'auto' : '100%'}
        minH={0}
        maxH={maxH}
        pt={0.5}
        showLoadingOverlay
      >
        {data.map((item) => {
          const disabled = isItemDisabled(item);
          const selected = item.id === value;
          return (
            <Flex
              key={item.id}
              alignItems={'center'}
              h={'36px'}
              flexShrink={0}
              px={3}
              borderRadius={'md'}
              cursor={disabled ? 'not-allowed' : 'pointer'}
              color={disabled ? 'myGray.400' : 'myGray.900'}
              bg={selected ? 'primary.50 !important' : undefined}
              _hover={disabled ? undefined : { bg: 'myGray.100' }}
              onClick={() => onClickItem(item)}
            >
              <Flex alignItems={'center'} justifyContent={'center'} w={'20px'} h={'20px'} mr={2}>
                <Avatar
                  src={item.isFolder ? FolderImgUrl : item.avatar}
                  w={'20px'}
                  h={'20px'}
                  borderRadius={'sm'}
                />
              </Flex>
              <Box flex={'1 1 0'} minW={0} fontSize={['md', 'sm']} className={'textEllipsis'}>
                {item.name}
              </Box>
              {item.isFolder && (
                <Flex
                  alignItems={'center'}
                  justifyContent={'center'}
                  flex={'0 0 auto'}
                  w={'20px'}
                  h={'20px'}
                  ml={2}
                  borderRadius={'xs'}
                  cursor={disabled ? 'not-allowed' : 'pointer'}
                  _hover={disabled ? undefined : { bg: 'rgba(31, 35, 41, 0.08)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    enterFolderFromArrow(item);
                  }}
                >
                  <MyIcon name={'common/rightArrowFill'} w={'16px'} color={'myGray.500'} />
                </Flex>
              )}
            </Flex>
          );
        })}
      </ScrollData>
    </Box>
  );
};

export default SelectOneResource;
