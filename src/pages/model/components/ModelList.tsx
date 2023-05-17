import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex, useTheme, Input, IconButton, Tooltip, Image } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
import MyIcon from '@/components/Icon';
import { postCreateModel } from '@/api/model';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/user';

const ModelList = ({ modelId }: { modelId: string }) => {
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { Loading, setIsLoading } = useLoading();
  const { myModels, myCollectionModels, loadMyModels, refreshModel } = useUserStore();
  const [searchText, setSearchText] = useState('');

  /* 加载模型 */
  const { isLoading } = useQuery(['loadModels'], () => loadMyModels(false));

  const onclickCreateModel = useCallback(async () => {
    setIsLoading(true);
    try {
      const id = await postCreateModel({ name: `AI助手${myModels.length + 1}` });
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

  const models = useMemo(
    () =>
      [
        {
          label: '我的',
          list: myModels.filter((item) =>
            new RegExp(searchText, 'ig').test(item.name + item.systemPrompt)
          )
        },
        {
          label: '收藏',
          list: myCollectionModels.filter((item) =>
            new RegExp(searchText, 'ig').test(item.name + item.systemPrompt)
          )
        }
      ].filter((item) => item.list.length > 0),
    [myCollectionModels, myModels, searchText]
  );

  const totalModels = useMemo(
    () => models.reduce((sum, item) => sum + item.list.length, 0),
    [models]
  );

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
            placeholder="搜索 AI 助手"
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
        <Tooltip label={'新建一个AI助手'}>
          <IconButton
            h={'32px'}
            icon={<AddIcon />}
            aria-label={''}
            variant={'outline'}
            onClick={onclickCreateModel}
          />
        </Tooltip>
      </Flex>
      <Box flex={'1 0 0'} h={0} overflow={'overlay'}>
        {models.map((item) => (
          <Box key={item.label} _notFirst={{ mt: 5 }}>
            <Box fontWeight={'bold'} pl={5}>
              {item.label}
            </Box>
            {item.list.map((item) => (
              <Flex
                key={item._id}
                position={'relative'}
                alignItems={['flex-start', 'center']}
                p={3}
                mb={[2, 0]}
                cursor={'pointer'}
                transition={'background-color .2s ease-in'}
                borderLeft={['', '5px solid transparent']}
                _hover={{
                  backgroundColor: ['', '#dee0e3']
                }}
                {...(modelId === item._id
                  ? {
                      backgroundColor: '#eff0f1',
                      borderLeftColor: 'myBlue.600 !important'
                    }
                  : {})}
                onClick={() => {
                  if (item._id === modelId) return;
                  router.push(`/model?modelId=${item._id}`);
                }}
              >
                <Image
                  src={item.avatar || '/icon/logo.png'}
                  alt=""
                  w={'34px'}
                  maxH={'50px'}
                  objectFit={'contain'}
                />
                <Box flex={'1 0 0'} w={0} ml={3}>
                  <Box className="textEllipsis" color={'myGray.1000'}>
                    {item.name}
                  </Box>
                  <Box className="textEllipsis" color={'myGray.400'} fontSize={'sm'}>
                    {item.systemPrompt || '这个AI助手没有设置提示词~'}
                  </Box>
                </Box>
              </Flex>
            ))}
          </Box>
        ))}

        {!isLoading && totalModels === 0 && (
          <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'30vh'}>
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              还没有 AI 助手~
            </Box>
          </Flex>
        )}
      </Box>
      <Loading loading={isLoading} fixed={false} />
    </Flex>
  );
};

export default ModelList;
