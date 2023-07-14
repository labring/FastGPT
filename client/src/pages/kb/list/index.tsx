import React, { useCallback } from 'react';
import { Box, Card, Flex, Grid, useTheme, Button, IconButton } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import PageContainer from '@/components/PageContainer';
import { useConfirm } from '@/hooks/useConfirm';
import { AddIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { delKbById, postCreateKb } from '@/api/plugins/kb';
import { useRequest } from '@/hooks/useRequest';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import Tag from '@/components/Tag';

const Kb = () => {
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { openConfirm, ConfirmChild } = useConfirm({
    title: '删除提示',
    content: '确认删除该知识库？'
  });
  const { myKbList, loadKbList, setKbList } = useUserStore();

  useQuery(['loadKbList'], () => loadKbList());

  /* 点击删除 */
  const onclickDelKb = useCallback(
    async (id: string) => {
      try {
        delKbById(id);
        toast({
          title: '删除成功',
          status: 'success'
        });
        setKbList(myKbList.filter((item) => item._id !== id));
      } catch (err: any) {
        toast({
          title: err?.message || '删除失败',
          status: 'error'
        });
      }
    },
    [toast, setKbList, myKbList]
  );

  /* create a new kb and router to it */
  const { mutate: onclickCreate, isLoading } = useRequest({
    mutationFn: async () => {
      const name = `知识库${myKbList.length + 1}`;
      const id = await postCreateKb({ name });
      return id;
    },
    successToast: '创建成功',
    errorToast: '创建知识库出现意外',
    onSuccess(id) {
      router.push(`/kb/detail?kbId=${id}`);
    }
  });

  return (
    <PageContainer>
      <Flex pt={3} px={5} alignItems={'center'}>
        <Box flex={1} className="textlg" letterSpacing={1} fontSize={'24px'} fontWeight={'bold'}>
          我的知识库
        </Box>
        <Button
          isLoading={isLoading}
          leftIcon={<AddIcon />}
          variant={'base'}
          onClick={onclickCreate}
        >
          新建
        </Button>
      </Flex>
      <Grid
        p={5}
        gridTemplateColumns={['1fr', 'repeat(3,1fr)', 'repeat(4,1fr)', 'repeat(5,1fr)']}
        gridGap={5}
      >
        {myKbList.map((kb) => (
          <Card
            display={'flex'}
            flexDirection={'column'}
            key={kb._id}
            py={4}
            px={5}
            cursor={'pointer'}
            h={'140px'}
            border={theme.borders.md}
            boxShadow={'none'}
            userSelect={'none'}
            position={'relative'}
            _hover={{
              boxShadow: '1px 1px 10px rgba(0,0,0,0.2)',
              borderColor: 'transparent',
              '& .delete': {
                display: 'block'
              }
            }}
            onClick={() =>
              router.push({
                pathname: '/kb/detail',
                query: {
                  kbId: kb._id
                }
              })
            }
          >
            <Flex alignItems={'center'} h={'38px'}>
              <Avatar src={kb.avatar} borderRadius={'lg'} w={'28px'} />
              <Box ml={3}>{kb.name}</Box>
              <IconButton
                className="delete"
                position={'absolute'}
                top={4}
                right={4}
                size={'sm'}
                icon={<MyIcon name={'delete'} w={'14px'} />}
                variant={'base'}
                borderRadius={'md'}
                aria-label={'delete'}
                display={['', 'none']}
                _hover={{
                  bg: 'red.100'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  openConfirm(() => onclickDelKb(kb._id))();
                }}
              />
            </Flex>
            <Box flex={'1 0 0'} overflow={'hidden'} pt={2}>
              {kb.tags.map((tag, i) => (
                <Tag key={i} mr={2} mb={2}>
                  {tag}
                </Tag>
              ))}
            </Box>
          </Card>
        ))}
      </Grid>
      <ConfirmChild />
    </PageContainer>
  );
};

export default Kb;
