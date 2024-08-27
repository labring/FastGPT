import Avatar from '@fastgpt/web/components/common/Avatar';
import { Box, HStack, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getGroupList } from '@/web/support/user/team/group/api';

function MemberTable() {
  const { userInfo } = useUserStore();
  const { t } = useTranslation();

  const { ConfirmModal: ConfirmRemoveMemberModal, openConfirm: openRemoveMember } = useConfirm({
    type: 'delete'
  });

  const { data: members } = useRequest2(getGroupList, {
    manual: false
  });

  return (
    <MyBox>
      <TableContainer overflow={'unset'} fontSize={'sm'}>
        <Table overflow={'unset'}>
          <Thead bg={'myWhite.400'}>
            <Tr>
              <Th borderRadius={'none !important'}>{t('user:team.group.name')}</Th>
              <Th>{t('user:team.group.members')}</Th>
              <Th borderRadius={'none !important'}>{t('common:common.Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {members?.map((item) => (
              <Tr key={item._id} overflow={'unset'}>
                <Td>
                  <HStack>
                    <Avatar src={item.avatar} w={['18px', '22px']} />
                    <Box maxW={'150px'} className={'textEllipsis'}>
                      {item.name}
                    </Box>
                  </HStack>
                </Td>
                {/* <Td> */}
                {/*   {userInfo?.team.permission.hasManagePer && */}
                {/*     item.role !== TeamMemberRoleEnum.owner && */}
                {/*     item.tmbId !== userInfo?.team.tmbId && ( */}
                {/*       <PermissionSelect */}
                {/*         value={item.permission.value} */}
                {/*         Button={ */}
                {/*           <MenuButton */}
                {/*             _hover={{ */}
                {/*               color: 'primary.600' */}
                {/*             }} */}
                {/*             borderRadius={'md'} */}
                {/*             px={2} */}
                {/*             py={1} */}
                {/*             lineHeight={1} */}
                {/*           > */}
                {/*             <MyIcon name={'edit'} cursor={'pointer'} w="1rem" /> */}
                {/*           </MenuButton> */}
                {/*         } */}
                {/*         onChange={(permission) => { */}
                {/*           onUpdateCollaborators({ */}
                {/*             tmbIds: [item.tmbId], */}
                {/*             permission */}
                {/*           }); */}
                {/*         }} */}
                {/*         onDelete={() => { */}
                {/*           openRemoveMember( */}
                {/*             () => delRemoveMember(item.tmbId).then(refetchMembers), */}
                {/*             undefined, */}
                {/*             t('user.team.Remove Member Confirm Tip', { */}
                {/*               username: item.memberName */}
                {/*             }) */}
                {/*           )(); */}
                {/*         }} */}
                {/*       /> */}
                {/*     )} */}
                {/* </Td> */}
              </Tr>
            ))}
          </Tbody>
        </Table>

        <ConfirmRemoveMemberModal />
      </TableContainer>
    </MyBox>
  );
}

export default MemberTable;
