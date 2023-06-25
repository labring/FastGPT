import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex, Input, IconButton, Tooltip, useTheme } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
import MyIcon from '@/components/Icon';
import { postCreateModel } from '@/api/model';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/user';
import { MyModelsTypeEnum } from '@/constants/user';
import dynamic from 'next/dynamic';

const Avatar = dynamic(() => import('@/components/Avatar'), {
  ssr: false
});
const Tabs = dynamic(() => import('@/components/Tabs'), {
  ssr: false
});

const ModelList = ({ modelId }: { modelId: string }) => {
  const [currentTab, setCurrentTab] = useState(MyModelsTypeEnum.my);

  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { Loading, setIsLoading } = useLoading();
  const { myModels, myCollectionModels, loadMyModels, refreshModel } = useUserStore();
  const [searchText, setSearchText] = useState('');

  /* 加载模型 */
  const { isFetching } = useQuery(['loadModels'], () => loadMyModels(false));

  const onclickCreateModel = useCallback(async () => {
    setIsLoading(true);
    try {
      const id = await postCreateModel({
        name: `AI应用${myModels.length + 1}`
      });
      toast({
        title: '创建成功',
        status: 'success'
      });
      refreshModel.freshMyModels();
      router.push(`/model?modelId=${id}`);
    } catch (err: any) {
      toast({
        title: typeof err === 'string' ? err : err.message || '出现了意外',
        status: 'error'
      });
    }
    setIsLoading(false);
  }, [myModels.length, refreshModel, router, setIsLoading, toast]);

  const currentModels = useMemo(() => {
    const map = {
      [MyModelsTypeEnum.my]: {
        list: myModels.filter((item) => new RegExp(searchText, 'ig').test(item.name + item.intro)),
        emptyText: '还没有 AI 应用~\n快来创建一个吧'
      },
      [MyModelsTypeEnum.collection]: {
        list: myCollectionModels.filter((item) =>
          new RegExp(searchText, 'ig').test(item.name + item.intro)
        ),
        emptyText: '收藏的 AI 应用为空~\n快去市场找一个吧'
      }
    };
    return map[currentTab];
  }, [currentTab, myCollectionModels, myModels, searchText]);

  return (
    <Flex
      position={'relative'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'white'}
      borderRight={['', theme.borders.base]}
    >
      <Flex w={'90%'} mt={5} mb={3} mx={'auto'}>
        <Flex flex={1} mr={2} position={'relative'} alignItems={'center'}>
          <Input
            h={'32px'}
            placeholder="根据名字和介绍搜索 AI 应用"
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
        <Tooltip label={'新建一个AI应用'}>
          <IconButton
            h={'32px'}
            icon={<AddIcon />}
            aria-label={''}
            variant={'base'}
            onClick={onclickCreateModel}
          />
        </Tooltip>
      </Flex>
      <Flex userSelect={'none'}>
        <Box flex={1}></Box>
        <Tabs
          w={'130px'}
          list={[
            { label: '我的', id: MyModelsTypeEnum.my },
            { label: '收藏', id: MyModelsTypeEnum.collection }
          ]}
          activeId={currentTab}
          size={'sm'}
          onChange={(id: any) => setCurrentTab(id)}
        />
      </Flex>
      <Box flex={'1 0 0'} h={0} pl={[0, 2]} overflowY={'scroll'} userSelect={'none'}>
        {currentModels.list.map((item) => (
          <Flex
            key={item._id}
            position={'relative'}
            alignItems={'center'}
            p={3}
            mb={[2, 0]}
            cursor={'pointer'}
            transition={'background-color .2s ease-in'}
            borderRadius={['', 'md']}
            borderBottom={['1px solid #f4f4f4', 'none']}
            _hover={{
              backgroundImage: ['', theme.lgColor.hoverBlueGradient]
            }}
            {...(modelId === item._id
              ? {
                  backgroundImage: `${theme.lgColor.activeBlueGradient} !important`
                }
              : {})}
            onClick={() => {
              if (item._id === modelId) return;
              router.push(`/model?modelId=${item._id}`);
            }}
          >
            <Avatar src={item.avatar} w={'34px'} h={'34px'} />
            <Box flex={'1 0 0'} w={0} ml={3}>
              <Box className="textEllipsis" color={'myGray.1000'}>
                {item.name}
              </Box>
            </Box>
          </Flex>
        ))}
        {!isFetching && currentModels.list.length === 0 && (
          <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'30vh'}>
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              {currentModels.emptyText}
            </Box>
          </Flex>
        )}
      </Box>
      <Loading loading={isFetching} fixed={false} />
    </Flex>
  );
};

export default ModelList;
