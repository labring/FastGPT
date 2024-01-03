import React, { useState } from 'react';
import { Box, Grid, Card, useTheme, Flex, IconButton, Button, Image } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { AddIcon } from '@chakra-ui/icons';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';

import MyIcon from '@fastgpt/web/components/common/Icon';
import PageContainer from '@/components/PageContainer';
import Avatar from '@/components/Avatar';
import EditModal, { defaultForm, FormType } from './component/EditModal';
import { getUserPlugins } from '@/web/core/plugin/api';
import EmptyTip from '@/components/EmptyTip';

const MyModules = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [editModalData, setEditModalData] = useState<FormType>();

  /* load plugins */
  const {
    data = [],
    isLoading,
    refetch
  } = useQuery(['loadModules'], () => getUserPlugins(), {
    refetchOnMount: true
  });

  return (
    <PageContainer isLoading={isLoading} insertProps={{ px: [5, '48px'] }}>
      <Flex pt={[4, '30px']} alignItems={'center'} justifyContent={'space-between'}>
        <Flex flex={1} alignItems={'center'}>
          <Image src={'/imgs/module/plugin.svg'} alt={''} mr={2} h={'24px'} />
          <Box className="textlg" letterSpacing={1} fontSize={['20px', '24px']} fontWeight={'bold'}>
            {t('plugin.My Plugins')}({t('common.Beta')})
          </Box>
        </Flex>
        <Button
          leftIcon={<AddIcon />}
          variant={'primaryOutline'}
          onClick={() => setEditModalData(defaultForm)}
        >
          {t('common.New Create')}
        </Button>
      </Flex>
      <Grid
        py={5}
        gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
        gridGap={5}
      >
        {data.map((plugin) => (
          <Box
            key={plugin._id}
            py={3}
            px={5}
            cursor={'pointer'}
            minH={'140px'}
            borderWidth={'1.5px'}
            borderColor={'borderColor.low'}
            bg={'white'}
            borderRadius={'md'}
            userSelect={'none'}
            position={'relative'}
            _hover={{
              borderColor: 'primary.300',
              boxShadow: '1.5',
              '& .edit': {
                display: 'flex'
              }
            }}
            onClick={() => router.push(`/plugin/edit?pluginId=${plugin._id}`)}
          >
            <Flex alignItems={'center'} h={'38px'}>
              <Avatar src={plugin.avatar} borderRadius={'md'} w={'28px'} />
              <Box ml={3}>{plugin.name}</Box>
              <IconButton
                className="edit"
                position={'absolute'}
                top={4}
                right={4}
                size={'smSquare'}
                icon={<MyIcon name={'edit'} w={'14px'} />}
                variant={'whitePrimary'}
                aria-label={'edit'}
                display={['', 'none']}
                _hover={{
                  bg: 'primary.100'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditModalData({
                    id: plugin._id,
                    name: plugin.name,
                    avatar: plugin.avatar,
                    intro: plugin.intro
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
              {plugin.intro || t('plugin.No Intro')}
            </Box>
          </Box>
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
