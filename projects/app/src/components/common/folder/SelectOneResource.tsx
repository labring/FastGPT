import React, { useCallback, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import {
  GetResourceFolderListProps,
  GetResourceListItemResponse,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useQuery } from '@tanstack/react-query';
import Loading from '@fastgpt/web/components/common/MyLoading';
import Avatar from '@/components/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

type ResourceItemType = GetResourceListItemResponse & {
  open: boolean;
  children?: ResourceItemType[];
};

const SelectOneResource = ({
  server,
  value,
  onSelect
}: {
  server: (e: GetResourceFolderListProps) => Promise<GetResourceListItemResponse[]>;
  value?: ParentIdType;
  onSelect: (e?: string) => any;
}) => {
  const [dataList, setDataList] = useState<ResourceItemType[]>([]);

  const { loading } = useRequest2(() => server({ parentId: null }), {
    manual: false,
    onSuccess: (data) => {
      setDataList(
        data.map((item) => ({
          ...item,
          open: false
        }))
      );
    }
  });

  const RenderItem = useCallback(
    ({ list, index = 0 }: { list: ResourceItemType[]; index?: number }) => {
      return (
        <>
          {list.map((item) => (
            <Box key={item.id} _notLast={{ mb: 0.5 }} userSelect={'none'}>
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                py={1}
                pl={`${1.25 * index + 0.5}rem`}
                pr={2}
                borderRadius={'md'}
                _hover={{
                  bg: 'myGray.100'
                }}
                {...(item.id === value
                  ? {
                      bg: 'primary.50 !important',
                      onClick: () => onSelect(undefined)
                    }
                  : {
                      onClick: async () => {
                        if (item.isFolder) {
                          if (!item.children) {
                            const data = await server({ parentId: item.id });
                            item.children = data.map((item) => ({
                              ...item,
                              open: false
                            }));
                          }

                          item.open = !item.open;
                          setDataList([...dataList]);
                        } else {
                          onSelect(item.id);
                        }
                      }
                    })}
              >
                <Flex
                  alignItems={'center'}
                  justifyContent={'center'}
                  visibility={
                    item.isFolder && (!item.children || item.children.length > 0)
                      ? 'visible'
                      : 'hidden'
                  }
                  w={'1.25rem'}
                  h={'1.25rem'}
                  cursor={'pointer'}
                  borderRadius={'xs'}
                  _hover={{
                    bg: 'rgba(31, 35, 41, 0.08)'
                  }}
                >
                  <MyIcon
                    name={'common/rightArrowFill'}
                    w={'14px'}
                    color={'myGray.500'}
                    transform={item.open ? 'rotate(90deg)' : 'none'}
                  />
                </Flex>
                <Avatar ml={index !== 0 ? '0.5rem' : 0} src={item.avatar} w={'1.25rem'} />
                <Box fontSize={'sm'} ml={2}>
                  {item.name}
                </Box>
              </Flex>
              {item.children && item.open && (
                <Box mt={0.5}>
                  <RenderItem list={item.children} index={index + 1} />
                </Box>
              )}
            </Box>
          ))}
        </>
      );
    },
    [value, onSelect, dataList, server]
  );

  return loading ? <Loading fixed={false} /> : <RenderItem list={dataList} />;
};

export default SelectOneResource;
