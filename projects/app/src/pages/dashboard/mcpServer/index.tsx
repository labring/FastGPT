'use client';
import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useState } from 'react';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Card
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { deleteMcpServer, getMcpServerList } from '@/web/support/mcp/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import InfoBanner from '@fastgpt/web/components/common/InfoBanner';
import EditMcpModal, {
  defaultForm,
  type EditMcForm
} from '@/pageComponents/dashboard/mcp/EditModal';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import dynamic from 'next/dynamic';
import { type McpKeyType } from '@fastgpt/global/support/mcp/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useUserStore } from '@/web/support/user/useUserStore';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

const UsageWay = dynamic(() => import('@/pageComponents/dashboard/mcp/usageWay'), {
  ssr: false
});

const McpServer = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();

  const {
    data: mcpServerList = [],
    loading: loadingList,
    refresh: loadMcpList
  } = useRequest(getMcpServerList, {
    manual: false
  });

  const [editMcp, setEditMcp] = useState<EditMcForm>();
  const [usageWay, setUsageWay] = useState<McpKeyType>();

  const { runAsync: onDeleteMcpServer } = useRequest(deleteMcpServer, {
    manual: true,
    onSuccess: () => {
      loadMcpList();
    }
  });

  const isLoading = loadingList;

  return (
    <>
      <DashboardContainer>
        {({ MenuIcon }) => (
          <MyBox
            isLoading={isLoading}
            h={'100%'}
            px={4}
            pb={3}
            display={'flex'}
            flexDirection={'column'}
          >
            {isPc ? (
              <Flex alignItems={'center'} justifyContent={'space-between'} h={'76px'}>
                <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
                  {t('dashboard_mcp:mcp_server')}
                </Box>
                <Button
                  isDisabled={!userInfo?.permission.hasApikeyCreatePer}
                  onClick={() => setEditMcp(defaultForm)}
                >
                  {t('dashboard_mcp:create_mcp_server')}
                </Button>
              </Flex>
            ) : (
              <>
                <HStack>
                  <Box>{MenuIcon}</Box>
                  <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
                    {t('dashboard_mcp:mcp_server')}
                  </Box>
                </HStack>
                <Flex mt={2} justifyContent={'flex-end'}>
                  <Button
                    isDisabled={!userInfo?.permission.hasApikeyCreatePer}
                    onClick={() => setEditMcp(defaultForm)}
                  >
                    {t('dashboard_mcp:create_mcp_server')}
                  </Button>
                </Flex>
              </>
            )}
            <Card flex={1} px={4} display={'flex'} flexDirection={'column'}>
              {/* table */}
              <TableContainer mt={4} overflowY={'auto'} fontSize={'sm'}>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t('dashboard_mcp:mcp_name')}</Th>
                      <Th>{t('dashboard_mcp:mcp_apps')}</Th>
                      <Th w={'311px'}>{t('common:Action')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {mcpServerList.map((mcp) => {
                      return (
                        <Tr key={mcp._id} _hover={{ bg: 'myGray.100' }} h={'50px'}>
                          <Td>{mcp.name}</Td>
                          <Td>{mcp.apps.length}</Td>
                          <Td h={'50px'} w={'311px'} py={'10px'}>
                            <HStack spacing={2}>
                              <Button
                                variant={'whiteBase'}
                                size={'sm'}
                                onClick={() => setUsageWay(mcp)}
                              >
                                {t('dashboard_mcp:start_use')}
                              </Button>
                              <Button
                                variant={'whiteBase'}
                                size={'sm'}
                                onClick={() =>
                                  setEditMcp({
                                    id: mcp._id,
                                    name: mcp.name,
                                    apps: mcp.apps
                                  })
                                }
                              >
                                {t('common:Edit')}
                              </Button>

                              <PopoverConfirm
                                Trigger={
                                  <Button variant={'whiteBase'} size={'sm'}>
                                    {t('common:Delete')}
                                  </Button>
                                }
                                type="delete"
                                content={t('dashboard_mcp:delete_mcp_server_confirm_tip')}
                                onConfirm={() => onDeleteMcpServer(mcp._id)}
                              />
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableContainer>
              {mcpServerList.length === 0 && <EmptyTip flex={1} py={0} justifyContent={'center'} />}
            </Card>
          </MyBox>
        )}
      </DashboardContainer>

      {!!usageWay && <UsageWay mcp={usageWay} onClose={() => setUsageWay(undefined)} />}
      {!!editMcp && (
        <EditMcpModal
          editMcp={editMcp}
          onClose={() => setEditMcp(undefined)}
          onSuccess={() => {
            setEditMcp(undefined);
            loadMcpList();
          }}
        />
      )}
    </>
  );
};

export default McpServer;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dashboard_mcp', 'account']))
    }
  };
}
