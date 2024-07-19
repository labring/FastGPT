import React, { useMemo, useState } from 'react';
import { Box, BoxProps, Flex } from '@chakra-ui/react';
import {
  GetResourceFolderListProps,
  GetResourceListItemResponse,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Loading from '@fastgpt/web/components/common/MyLoading';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useMemoizedFn } from 'ahooks';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { useTranslation } from 'next-i18next';

type ResourceItemType = GetResourceListItemResponse & {
  open: boolean;
  children?: ResourceItemType[];
};

const rootId = 'root';

const SelectOneResource = ({
  server,
  value,
  onSelect,
  maxH = ['80vh', '600px']
}: {
  server: (e: GetResourceFolderListProps) => Promise<GetResourceListItemResponse[]>;
  value?: ParentIdType;
  onSelect: (e?: string) => any;
  maxH?: BoxProps['maxH'];
}) => {
  const { t } = useTranslation();
  const [dataList, setDataList] = useState<ResourceItemType[]>([]);
  const [requestingIdList, setRequestingIdList] = useState<ParentIdType[]>([]);

  const concatRoot = useMemo(() => {
    const root: ResourceItemType = {
      id: rootId,
      open: true,
      avatar: FolderImgUrl,
      name: t('common:common.folder.Root Path'),
      isFolder: true,
      children: dataList
    };
    return [root];
  }, [dataList, t]);

  const { runAsync: requestServer } = useRequest2((e: GetResourceFolderListProps) => {
    if (requestingIdList.includes(e.parentId)) return Promise.reject(null);

    setRequestingIdList((state) => [...state, e.parentId]);
    return server(e).finally(() =>
      setRequestingIdList((state) => state.filter((id) => id !== e.parentId))
    );
  }, {});

  const { loading } = useRequest2(() => requestServer({ parentId: null }), {
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

  const Render = useMemoizedFn(
    ({ list, index = 0 }: { list: ResourceItemType[]; index?: number }) => {
      return (
        <>
          {list.map((item) => (
            <Box key={item.id} _notLast={{ mb: 0.5 }} userSelect={'none'}>
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                py={1}
                pl={index === 0 ? '0.5rem' : `${1.75 * (index - 1) + 0.5}rem`}
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
                        if (item.id === rootId) return;
                        // folder => open(request children) or close
                        if (item.isFolder) {
                          if (!item.children) {
                            const data = await requestServer({ parentId: item.id });
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
                {index !== 0 && (
                  <Flex
                    alignItems={'center'}
                    justifyContent={'center'}
                    visibility={item.isFolder ? 'visible' : 'hidden'}
                    w={'1.25rem'}
                    h={'1.25rem'}
                    cursor={'pointer'}
                    borderRadius={'xs'}
                    _hover={{
                      bg: 'rgba(31, 35, 41, 0.08)'
                    }}
                  >
                    <MyIcon
                      name={
                        requestingIdList.includes(item.id)
                          ? 'common/loading'
                          : 'common/rightArrowFill'
                      }
                      w={'14px'}
                      color={'myGray.500'}
                      transform={item.open ? 'rotate(90deg)' : 'none'}
                    />
                  </Flex>
                )}
                <Avatar
                  ml={index !== 0 ? '0.5rem' : 0}
                  src={item.avatar}
                  w={'1.25rem'}
                  borderRadius={'sm'}
                />
                <Box fontSize={['md', 'sm']} ml={2} className="textEllipsis">
                  {item.name}
                </Box>
              </Flex>
              {item.children && item.open && (
                <Box mt={0.5}>
                  <Render list={item.children} index={index + 1} />
                </Box>
              )}
            </Box>
          ))}
        </>
      );
    }
  );

  return loading ? (
    <Loading fixed={false} />
  ) : (
    <Box maxH={maxH} h={'100%'} overflow={'auto'}>
      <Render list={concatRoot} />
    </Box>
  );
};

export default SelectOneResource;
