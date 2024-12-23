import { deleteOrg } from '@/web/support/user/team/org/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Divider,
  HStack,
  Table,
  TableContainer,
  Tag,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useDisclosure
} from '@chakra-ui/react';
import { DEFAULT_ORG_AVATAR } from '@fastgpt/global/common/system/constants';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyMenu, { MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import MemberTag from '../../../../../components/support/user/team/Info/MemberTag';
import { TeamContext } from '../context';
import IconButton from './IconButton';
import OrgInfoModal from './OrgInfoModal';
import OrgMoveModal from './OrgMoveModal';

function ActionButton({
  icon,
  text,
  onClick
}: {
  icon: IconNameType;
  text: string;
  onClick: () => void;
}) {
  return (
    <HStack
      gap={'8px'}
      w="100%"
      transition={'background 0.1s'}
      cursor={'pointer'}
      p="4px"
      rounded={'sm'}
      _hover={{
        bg: 'myGray.05',
        color: 'primary.600'
      }}
      onClick={onClick}
    >
      <MyIcon name={icon} w="16px" h="16px" p="1" />
      <Text fontSize={'12px'} lineHeight={'16px'}>
        {text}
      </Text>
    </HStack>
  );
}

function MemberTable() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { orgs, refetchOrgs, members, refetchMembers } = useContextSelector(TeamContext, (v) => v);
  const [currentOrg, setCurrentOrg] = useState<OrgType | undefined>();

  // Set current org by hash
  useEffect(() => {
    if (orgs.length > 0) {
      const hash = window.location.hash.substring(1);
      const initialOrg = orgs.find((org) => org._id === hash) || orgs[0];
      setCurrentOrg(initialOrg);
    }
  }, [orgs]);
  // Update hash when current org changes
  useEffect(() => {
    if (currentOrg) {
      window.location.hash = currentOrg._id;
    }
  }, [currentOrg]);

  const currentPath = useMemo<{ path: string; parents: OrgType[] }>(
    () => ({
      path: currentOrg ? `${currentOrg.path}/${currentOrg._id}` : '',
      parents: currentOrg
        ? currentOrg.path
            .split('/')
            .filter(Boolean)
            .map((orgId) => orgs.find((org) => org._id === orgId)!)
        : []
    }),
    [orgs, currentOrg]
  );

  const [editOrg, setEditOrg] = useState<OrgType | undefined>();
  const [createOrgParentId, setCreateOrgParentId] = useState<string | undefined>();

  const { ConfirmModal: ConfirmDeleteOrgModal, openConfirm: openDeleteOrgModal } = useConfirm({
    type: 'delete',
    content: t('account_team:confirm_delete_org')
  });

  const { runAsync: deleteOrgReq } = useRequest2(deleteOrg, {
    onSuccess: () => {
      refetchOrgs();
      refetchMembers();
    }
  });

  const deleteOrgHandler = (orgId: string) => openDeleteOrgModal(() => deleteOrgReq(orgId))();

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
          <BreadcrumbLink color="myGray.900" fontWeight={500}>
            {currentOrg?.path === '' ? userInfo?.team.teamName : currentOrg?.name}
          </BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>
      <HStack w={'100%'} gap={'16px'} alignItems={'start'}>
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
                      <HStack w="fit-content" cursor={'pointer'} onClick={() => setCurrentOrg(org)}>
                        <MemberTag name={org.name} avatar={org.avatar ?? DEFAULT_ORG_AVATAR} />
                        <Tag size="sm">{org.members.length}</Tag>
                        <MyIcon
                          name="core/chat/chevronRight"
                          w={'12px'}
                          h={'12px'}
                          color={'myGray.400'}
                        />
                      </HStack>
                    </Td>

                    <Td w={'6rem'}>
                      <MyMenu
                        trigger="click"
                        Button={
                          <MyIcon name="more" w={'1rem'} cursor={'pointer'} p="1" rounded={'sm'} />
                        }
                        menuList={[
                          {
                            children: [
                              {
                                icon: 'edit',
                                label: t('account_team:edit_info'),
                                onClick: () => {
                                  setEditOrg(org);
                                }
                              },
                              {
                                icon: 'common/file/move',
                                label: t('common:Move'),
                                onClick: () => {
                                  // TODO
                                  console.log(org._id);
                                }
                              },
                              {
                                icon: 'delete',
                                label: t('account_team:delete'),
                                type: 'danger',
                                onClick: () => deleteOrgHandler(org._id)
                              }
                            ]
                          }
                        ]}
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
                    <Td w={'6rem'}>
                      <MyMenu
                        trigger={'click'}
                        Button={
                          <MyIcon name="more" w={'1rem'} cursor={'pointer'} p="1" rounded={'sm'} />
                        }
                        menuList={[
                          {
                            children: [
                              {
                                icon: 'edit',
                                label: t('account_team:remark'),
                                onClick: () => {
                                  // TODO
                                  console.log(member.tmbId);
                                }
                              },
                              {
                                icon: 'common/file/move',
                                label: t('common:Move'),
                                onClick: () => {
                                  // TODO
                                  console.log(member.tmbId);
                                }
                              },
                              {
                                icon: 'delete',
                                label: t('account_team:delete'),
                                type: 'danger',
                                onClick: () => {
                                  // TODO
                                  console.log(member.tmbId);
                                }
                              }
                            ]
                          }
                        ]}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>

        <VStack w={'220px'} alignItems={'start'}>
          <HStack gap={'6px'}>
            <Avatar
              src={
                currentOrg?.path === ''
                  ? userInfo?.team.avatar
                  : (currentOrg?.avatar ?? DEFAULT_ORG_AVATAR)
              }
              w={'16px'}
              h={'16px'}
              rounded={'20%'}
            />
            <Text fontWeight={500} fontSize={'14px'} color={'myGray.900'} lineHeight={'20px'}>
              {currentOrg?.path === '' ? userInfo?.team.teamName : currentOrg?.name}
            </Text>
            {currentOrg?.path !== '' && (
              <IconButton name="edit" onClick={() => setEditOrg(currentOrg)} />
            )}
          </HStack>
          <Text fontSize={12} lineHeight={'16px'} w={'full'}>
            {currentOrg?.description ?? t('common:common.no_intro')}
          </Text>

          <Divider my={'20px'} />

          <Text fontWeight={500} mb="13px" fontSize="14px" color="myGray.900" lineHeight="20px">
            {t('common:common.Action')}
          </Text>
          <VStack gap="13px" w="100%">
            <ActionButton
              icon="common/add2"
              text={t('account_team:create_sub_org')}
              onClick={() => {
                setCreateOrgParentId(currentOrg?._id);
              }}
            />
            <ActionButton
              icon="common/administrator"
              text={t('account_team:manage_member')}
              onClick={() => {
                // TODO
                console.log('manage member');
              }}
            />
            {currentOrg?.path !== '' && (
              <>
                <ActionButton
                  icon="common/file/move"
                  text={t('account_team:move_org')}
                  onClick={() => {
                    // TODO
                    console.log('move org');
                  }}
                />
                <ActionButton
                  icon="delete"
                  text={t('account_team:delete_org')}
                  onClick={() => deleteOrgHandler(currentOrg?._id ?? '')}
                />
              </>
            )}
          </VStack>
        </VStack>
      </HStack>
      <OrgInfoModal
        editOrg={editOrg}
        createOrgParentId={createOrgParentId}
        onClose={() => {
          setEditOrg(undefined);
          setCreateOrgParentId(undefined);
        }}
        onSuccess={() => {
          refetchOrgs();
          refetchMembers();
        }}
      />
      <OrgMoveModal orgs={orgs} team={userInfo?.team!} />
      <ConfirmDeleteOrgModal />
    </VStack>
  );
}

export default MemberTable;
