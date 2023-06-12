import React, { useCallback, useState, useMemo } from 'react';
import { Box, Flex, useTheme, Input, IconButton, Tooltip } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
import { postCreateKb } from '@/api/plugins/kb';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/user';
import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import Tag from '@/components/Tag';

const KbList = ({ kbId }: { kbId: string }) => {
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { Loading, setIsLoading } = useLoading();
  const { myKbList, loadKbList } = useUserStore();
  const [searchText, setSearchText] = useState('');

  const kbs = useMemo(
    () => myKbList.filter((item) => new RegExp(searchText, 'ig').test(item.name + item.tags)),
    [myKbList, searchText]
  );

  /* 加载模型 */
  const { isFetching } = useQuery(['loadModels'], () => loadKbList(false));

  const handleCreateModel = useCallback(async () => {
    setIsLoading(true);
    try {
      const name = `知识库${myKbList.length + 1}`;
      const id = await postCreateKb({ name });
      await loadKbList(true);
      toast({
        title: '创建成功',
        status: 'success'
      });
      router.replace(`/kb?kbId=${id}`);
    } catch (err: any) {
      toast({
        title: typeof err === 'string' ? err : err.message || '出现了意外',
        status: 'error'
      });
    }
    setIsLoading(false);
  }, [loadKbList, myKbList.length, router, setIsLoading, toast]);

  return (
    <Flex
      position={'relative'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'white'}
      borderRight={['', theme.borders.base]}
    >
      <Flex w={'90%'} my={5} mx={'auto'}>
        <Flex flex={1} mr={2} position={'relative'} alignItems={'center'}>
          <Input
            h={'32px'}
            placeholder="搜索知识库"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {searchText && (
            <MyIcon
              zIndex={10}
              position={'absolute'}
              right={3}
              name={'closeSolid'}
              w={'16px'}
              h={'16px'}
              color={'myGray.500'}
              cursor={'pointer'}
              onClick={() => setSearchText('')}
            />
          )}
        </Flex>
        <Tooltip label={'新建一个知识库'}>
          <IconButton
            h={'32px'}
            icon={<AddIcon />}
            aria-label={''}
            variant={'base'}
            onClick={handleCreateModel}
          />
        </Tooltip>
      </Flex>
      <Box flex={'1 0 0'} h={0} pl={[0, 2]} overflowY={'scroll'} userSelect={'none'}>
        {kbs.map((item) => (
          <Flex
            key={item._id}
            position={'relative'}
            alignItems={['flex-start', 'center']}
            p={3}
            mb={[2, 0]}
            cursor={'pointer'}
            transition={'background-color .2s ease-in'}
            borderRadius={['', 'md']}
            borderBottom={['1px solid #f4f4f4', 'none']}
            _hover={{
              backgroundImage: ['', theme.lgColor.hoverBlueGradient]
            }}
            {...(kbId === item._id
              ? {
                  backgroundImage: `${theme.lgColor.activeBlueGradient} !important`
                }
              : {})}
            onClick={() => {
              if (item._id === kbId) return;
              router.push(`/kb?kbId=${item._id}`);
            }}
          >
            <Avatar src={item.avatar} w={'34px'} h={'34px'} />
            <Box flex={'1 0 0'} w={0} ml={3}>
              <Box className="textEllipsis" color={'myGray.1000'}>
                {item.name}
              </Box>
              {/* tags */}
              <Box color={'myGray.400'} py={1} fontSize={'sm'}>
                {!item.tags ? (
                  <>{item.tags || '你还没设置标签~'}</>
                ) : (
                  item.tags.split(' ').map((item, i) => (
                    <Tag key={i} mr={1} mb={1}>
                      {item}
                    </Tag>
                  ))
                )}
              </Box>
            </Box>
          </Flex>
        ))}

        {!isFetching && myKbList.length === 0 && (
          <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'30vh'}>
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              知识库空空如也~
            </Box>
          </Flex>
        )}
      </Box>
      <Loading loading={isFetching} fixed={false} />
    </Flex>
  );
};

export default KbList;
