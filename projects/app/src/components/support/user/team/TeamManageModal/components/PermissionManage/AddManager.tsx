import {
  Box,
  Button,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Grid,
  Input,
  Flex,
  Checkbox,
  CloseButton,
  InputGroup,
  InputLeftElement
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { updateMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamModalContext } from '../../context';
import { useI18n } from '@/web/context/I18n';

function AddManagerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const { userT } = useI18n();
  const { userInfo } = useUserStore();
  const { members, refetchMembers } = useContextSelector(TeamModalContext, (v) => v);

  const [selected, setSelected] = useState<typeof members>([]);
  const [searchKey, setSearchKey] = useState('');

  const { mutate: submit, isLoading } = useRequest({
    mutationFn: async () => {
      return updateMemberPermission({
        permission: ManagePermissionVal,
        tmbIds: selected.map((item) => {
          return item.tmbId;
        })
      });
    },
    onSuccess: () => {
      refetchMembers();
      onSuccess();
    },
    successToast: t('common:common.Success'),
    errorToast: t('common:common.failed')
  });

  const filterMembers = useMemo(() => {
    return members.filter((member) => {
      if (member.permission.isOwner) return false;
      if (!searchKey) return true;
      return !!member.memberName.includes(searchKey);
    });
  }, [members, searchKey]);

  return (
    <MyModal
      isOpen
      iconSrc={'modal/AddClb'}
      maxW={['90vw']}
      minW={['900px']}
      overflow={'unset'}
      title={userT('team.Add manager')}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody py={6} px={10}>
        <Grid
          templateColumns="1fr 1fr"
          h="448px"
          borderRadius="8px"
          border="1px solid"
          borderColor="myGray.200"
        >
          <Flex flexDirection="column" p="4">
            <InputGroup alignItems="center" size={'sm'}>
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" color={'myGray.500'} />
              </InputLeftElement>
              <Input
                placeholder={t('user:search_user')}
                fontSize="sm"
                bg={'myGray.50'}
                onChange={(e) => {
                  setSearchKey(e.target.value);
                }}
              />
            </InputGroup>
            <Flex flexDirection="column" mt={3}>
              {filterMembers.map((member) => {
                return (
                  <Flex
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    alignItems="center"
                    key={member.tmbId}
                    cursor={'pointer'}
                    _hover={{
                      bg: 'myGray.50',
                      ...(!selected.includes(member) ? { svg: { color: 'myGray.50' } } : {})
                    }}
                    _notLast={{ mb: 2 }}
                    onClick={() => {
                      if (selected.indexOf(member) == -1) {
                        setSelected([...selected, member]);
                      } else {
                        setSelected([...selected.filter((item) => item.tmbId != member.tmbId)]);
                      }
                    }}
                  >
                    <Checkbox
                      isChecked={selected.includes(member)}
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
                    />
                    <Avatar ml={2} src={member.avatar} w="1.5rem" />
                    {member.memberName}
                  </Flex>
                );
              })}
            </Flex>
          </Flex>
          <Flex borderLeft="1px" borderColor="myGray.200" flexDirection="column" p="4">
            <Box mt={3}>{t('common:chosen') + ': ' + selected.length} </Box>
            <Box mt={5}>
              {selected.map((member) => {
                return (
                  <Flex
                    alignItems="center"
                    justifyContent="space-between"
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    key={member.tmbId}
                    _hover={{ bg: 'myGray.50' }}
                    _notLast={{ mb: 2 }}
                  >
                    <Avatar src={member.avatar} w="1.5rem" />
                    <Box w="full">{member.memberName}</Box>
                    <MyIcon
                      name={'common/closeLight'}
                      w={'1rem'}
                      cursor={'pointer'}
                      _hover={{ color: 'red.600' }}
                      onClick={() =>
                        setSelected([...selected.filter((item) => item.tmbId != member.tmbId)])
                      }
                    />
                  </Flex>
                );
              })}
            </Box>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button h={'30px'} isLoading={isLoading} onClick={submit}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddManagerModal;
