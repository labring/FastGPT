import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
  HStack,
  Icon,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '../context';
import MyMenu, { MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MemberTag from '../../../../../components/support/user/team/Info/MemberTag';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { OrgType } from '@fastgpt/global/support/user/team/org/type';

function MoreIconButton({ onClick }: { onClick: () => void }) {
  return (
    <MyIcon
      name="more"
      w={'1rem'}
      transition={'background 0.1s'}
      cursor={'pointer'}
      p="1"
      rounded={'sm'}
      _hover={{
        bg: 'myGray.05',
        color: 'primary.600'
      }}
      onClick={onClick}
    />
  );
}

function MemberTable() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { orgs, refetchOrgs, members, refetchMembers } = useContextSelector(TeamContext, (v) => v);
  const [currentOrg, setCurrentOrg] = useState<OrgType | undefined>();

  useEffect(() => {
    setCurrentOrg(orgs[0]);
  }, [setCurrentOrg, orgs]);

  const currentPath = useMemo<{ path: string; parents: OrgType[] }>(
    () => ({
      path: currentOrg ? currentOrg.path + '/' + currentOrg._id : '',
      parents: currentOrg
        ? currentOrg.path
            .split('/')
            .filter(Boolean)
            .map((orgId) => orgs.find((org) => org._id === orgId)!)
        : []
    }),
    [orgs, currentOrg]
  );

  return (
    <VStack>
      <Breadcrumb mr={'auto'}>
        {currentPath.parents.map((parent) => (
          <BreadcrumbItem key={parent._id}>
            <BreadcrumbLink onClick={() => setCurrentOrg(parent)}>
              {parent.path === '' ? userInfo?.team.teamName : parent.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
        ))}
        <BreadcrumbItem isCurrentPage>
          <BreadcrumbLink>
            {currentOrg?.path === '' ? userInfo?.team.teamName : currentOrg?.name}
          </BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>
      <HStack w={'100%'} gap={'16px'}>
        <TableContainer overflow={'unset'} fontSize={'sm'} flexGrow={1}>
          <Table overflow={'unset'}>
            <Thead>
              <Tr bg={'white !important'}>
                <Th bg="myGray.100" borderLeftRadius="6px">
                  {t('common:Name')}
                </Th>
                <Th bg="myGray.100" borderRightRadius="6px">
                  {t('common:common.Action')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {orgs
                .filter((org) => org.path === currentPath.path)
                .map((org) => (
                  <Tr key={org._id} overflow={'unset'}>
                    <Td>
                      <HStack cursor={'pointer'} onClick={() => setCurrentOrg(org)}>
                        <MemberTag name={org.name} avatar={org.avatar} />
                        <Box>({org.members.length})</Box>
                      </HStack>
                    </Td>

                    <Td w={'8rem'}>
                      <MoreIconButton
                        onClick={() => {
                          // TODO
                          console.log(org._id);
                        }}
                      />
                    </Td>
                  </Tr>
                ))}
              {currentOrg?.members.map((member) => {
                const memberInfo = members.find((m) => m.tmbId === member.tmbId);
                if (!memberInfo) return null;
                return (
                  <Tr key={member.tmbId} overflow={'unset'}>
                    <Td>
                      <MemberTag name={memberInfo.memberName} avatar={memberInfo.avatar} />
                    </Td>
                    <Td w={'8rem'}>
                      <MoreIconButton
                        onClick={() => {
                          // TODO
                          console.log(member.tmbId);
                        }}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
        <VStack>
          <Text>Org Metadata</Text>
        </VStack>
      </HStack>
    </VStack>
  );
}

export default MemberTable;
