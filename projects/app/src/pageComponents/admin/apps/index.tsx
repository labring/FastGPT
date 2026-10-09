'use client';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useRef, useState } from 'react';
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Flex,
  Box,
  HStack,
  Input,
  InputGroup
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getApps } from '@/web/admin/app/api';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const AppTable = () => {
  const { t } = useSafeTranslation();
  const [appDetail, setAppDetail] = useState<any>();
  const [searchKey, setSearchKey] = useState<string>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: apps,
    isLoading,
    Pagination,
    total,
    pageSize
  } = usePagination(getApps, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'admin-apps-list',
    params: {
      searchKey
    },
    refreshDeps: [searchKey],
    scrollContainerRef
  });

  const routeToApp = (id: string) => {
    window.open(getWebReqUrl('/app/detail?appId=' + id), '_blank');
  };

  return (
    <BoxPageRoot display={'flex'} flexDirection={'column'} h={'100%'} p={0}>
      <Flex
        h={'64px'}
        flexShrink={0}
        px={6}
        alignItems={'center'}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Box as={'h1'} {...accountTitleTextStyles}>
          {t('admin:user_apps')}
        </Box>
        <Box flexGrow={1}></Box>
        <InputGroup w={['100%', '250px']} h={'36px'}>
          <Input
            placeholder={t('admin:search_by_app_name_or_app_id')}
            h={'36px'}
            onChange={(e) => setSearchKey(e.target.value)}
          ></Input>
        </InputGroup>
      </Flex>
      <FixedTableContainer
        ref={scrollContainerRef}
        position={'relative'}
        h={'100%'}
        maxH={'none'}
        px={[4, 6]}
        py={6}
        footer={
          total > pageSize ? (
            <Flex mt={3} justifyContent={'center'}>
              <Pagination />
            </Flex>
          ) : undefined
        }
      >
        <Table minW={'1000px'}>
          <Thead>
            <Tr>
              <Th>{t('admin:app_id_2')}</Th>
              <Th>{t('admin:app_name_2')}</Th>
              <Th>{t('admin:creator')}</Th>
              <Th>{t('admin:team')}</Th>
              <Th>{t('admin:description')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {apps.map((item, i) => (
              <Tr key={i}>
                <Td>{item.id}</Td>
                <Td>{item.name}</Td>
                <Td>{item.username}</Td>
                <Td>{item.teamName}</Td>
                <Td maxW={'300px'} className="textEllipsis">
                  {item.intro || '-'}
                </Td>
                <Td textAlign={'center'}>
                  <HStack spacing={2} ml={4}>
                    <Button variant={'whiteBase'} size={'sm'} onClick={() => setAppDetail(item)}>
                      {t('admin:details')}
                    </Button>
                    <Button variant={'whiteBase'} size={'sm'} onClick={() => routeToApp(item.id)}>
                      {t('admin:open')}
                    </Button>
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!isLoading && apps.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              {t('admin:no_apps')}
            </Box>
          </Flex>
        )}
      </FixedTableContainer>

      {!!appDetail && <AppDetailModal app={appDetail} onClose={() => setAppDetail(undefined)} />}
    </BoxPageRoot>
  );
};

export default AppTable;

function AppDetailModal({ app, onClose }: { app: any; onClose: () => void }) {
  const { t } = useSafeTranslation();
  return (
    <MyModal isOpen={true} onClose={onClose} title={'应用详情'} maxW={['90vw', '700px']}>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:app_id_3')}</Box>
        <Box>{app.id}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:app_name_3')}</Box>
        <Box>{app.name}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:description_2')}</Box>
        <Box>{app.intro}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:creator_2')}</Box>
        <Box>{app.username}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:creator_id')}</Box>
        <Box>{app.userId}</Box>
      </Flex>
    </MyModal>
  );
}
