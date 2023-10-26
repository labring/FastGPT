import React, { useState } from 'react';
import { Box, Grid, Card, useTheme, Flex, IconButton, Button, Image } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { AddIcon } from '@chakra-ui/icons';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';

import MyIcon from '@/components/Icon';
import PageContainer from '@/components/PageContainer';
import Avatar from '@/components/Avatar';
import EditModal, { defaultForm, FormType } from './component/EditModal';
import { getUserModules } from '@/web/core/module/api';
import EmptyTip from '@/components/EmptyTip';

const MyModules = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [editModalData, setEditModalData] = useState<FormType>();

  /* load modules */
  const {
    data = [],
    isLoading,
    refetch
  } = useQuery(['loadModules'], () => getUserModules(), {
    refetchOnMount: true
  });

  return (
    <PageContainer isLoading={isLoading}>
      <Flex pt={3} px={5} alignItems={'center'}>
        <Flex flex={1} alignItems={'center'}>
          <Image src={'/imgs/module/combine.svg'} alt={''} mr={2} h={'24px'} />
          <Box className="textlg" letterSpacing={1} fontSize={'24px'} fontWeight={'bold'}>
            {t('app.module.Combine Modules')}
          </Box>
        </Flex>
        <Button
          leftIcon={<AddIcon />}
          variant={'base'}
          onClick={() => setEditModalData(defaultForm)}
        >
          {t('common.New Create')}
        </Button>
      </Flex>
      <Grid
        p={5}
        gridTemplateColumns={['1fr', 'repeat(3,1fr)', 'repeat(4,1fr)', 'repeat(5,1fr)']}
        gridGap={5}
      >
        {data.map((module) => (
          <Card
            key={module._id}
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
              },
              '& .chat': {
                display: 'block'
              }
            }}
            onClick={() => router.push(`/module/edit?moduleId=${module._id}`)}
          >
            <Flex alignItems={'center'} h={'38px'}>
              <Avatar src={module.avatar} borderRadius={'md'} w={'28px'} />
              <Box ml={3}>{module.name}</Box>
              <IconButton
                className="delete"
                position={'absolute'}
                top={4}
                right={4}
                size={'sm'}
                icon={<MyIcon name={'edit'} w={'14px'} />}
                variant={'base'}
                borderRadius={'md'}
                aria-label={'delete'}
                display={['', 'none']}
                _hover={{
                  bg: 'myBlue.200'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditModalData({
                    id: module._id,
                    name: module.name,
                    avatar: module.avatar,
                    intro: module.intro
                  });
                }}
              />
            </Flex>
            <Box
              className={'textEllipsis3'}
              py={2}
              wordBreak={'break-all'}
              fontSize={'sm'}
              color={'myGray.600'}
            >
              {module.intro || '这个模块还没写介绍~'}
            </Box>
          </Card>
        ))}
      </Grid>
      {data.length === 0 && <EmptyTip />}
      {!!editModalData && (
        <EditModal
          defaultValue={editModalData}
          onClose={() => setEditModalData(undefined)}
          onSuccess={refetch}
          onDelete={refetch}
        />
      )}
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}

export default MyModules;
