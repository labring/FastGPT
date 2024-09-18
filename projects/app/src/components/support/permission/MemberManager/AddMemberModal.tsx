import {
  Flex,
  Box,
  ModalBody,
  InputGroup,
  InputLeftElement,
  Input,
  Checkbox,
  ModalFooter,
  Button
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import { useMemo, useState } from 'react';
import PermissionSelect from './PermissionSelect';
import PermissionTags from './PermissionTags';
import { CollaboratorContext } from './context';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { ChevronDownIcon } from '@chakra-ui/icons';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';

export type AddModalPropsType = {
  onClose: () => void;
};

function AddMemberModal({ onClose }: AddModalPropsType) {
  const { t } = useTranslation();
  const { userInfo, loadAndGetTeamMembers } = useUserStore();

  const { permissionList, collaboratorList, onUpdateCollaborators, getPerLabelList } =
    useContextSelector(CollaboratorContext, (v) => v);
  const [searchText, setSearchText] = useState<string>('');

  const { data: members = [], loading: loadingMembers } = useRequest2(
    async () => {
      if (!userInfo?.team?.teamId) return [];
      const members = await loadAndGetTeamMembers(true);
      return members;
    },
    {
      manual: false,
      refreshDeps: [userInfo?.team?.teamId]
    }
  );
  const filterMembers = useMemo(() => {
    return members.filter((item) => {
      // if (item.permission.isOwner) return false;
      if (item.tmbId === userInfo?.team?.tmbId) return false;
      if (!searchText) return true;
      return item.memberName.includes(searchText);
    });
  }, [members, searchText, userInfo?.team?.tmbId]);

  const [selectedMemberIdList, setSelectedMembers] = useState<string[]>([]);
  const [selectedPermission, setSelectedPermission] = useState(permissionList['read'].value);
  const perLabel = useMemo(() => {
    return getPerLabelList(selectedPermission).join('、');
  }, [getPerLabelList, selectedPermission]);

  const { mutate: onConfirm, isLoading: isUpdating } = useRequest({
    mutationFn: () => {
      return onUpdateCollaborators({
        members: selectedMemberIdList,
        permission: selectedPermission
      });
    },
    successToast: t('common:common.Add Success'),
    errorToast: 'Error',
    onSuccess() {
      onClose();
    }
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="modal/AddClb"
      title={t('user:team.add_collaborator')}
      minW="800px"
    >
      <ModalBody>
        <MyBox
          isLoading={loadingMembers}
          display={'grid'}
          minH="400px"
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="0.5rem"
          gridTemplateColumns="55% 45%"
          fontSize={'sm'}
        >
          <Flex
            flexDirection="column"
            borderRight="1px solid"
            borderColor="myGray.200"
            p="4"
            minH="200px"
          >
            <InputGroup alignItems="center" size="sm">
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" color={'myGray.500'} />
              </InputLeftElement>
              <Input
                placeholder={t('user:search_user')}
                bgColor="myGray.50"
                onChange={(e) => setSearchText(e.target.value)}
              />
            </InputGroup>
            <Flex flexDirection="column" mt="2">
              {filterMembers.map((member) => {
                const onChange = () => {
                  if (selectedMemberIdList.includes(member.tmbId)) {
                    setSelectedMembers(selectedMemberIdList.filter((v) => v !== member.tmbId));
                  } else {
                    setSelectedMembers([...selectedMemberIdList, member.tmbId]);
                  }
                };
                const collaborator = collaboratorList.find((v) => v.tmbId === member.tmbId);
                return (
                  <Flex
                    key={member.tmbId}
                    mt="1"
                    py="1"
                    px="3"
                    borderRadius="sm"
                    alignItems="center"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer',
                      ...(!selectedMemberIdList.includes(member.tmbId)
                        ? { svg: { color: 'myGray.50' } }
                        : {})
                    }}
                  >
                    <Checkbox
                      mr="3"
                      isChecked={selectedMemberIdList.includes(member.tmbId)}
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
                      onChange={onChange}
                    />
                    <Flex
                      flexDirection="row"
                      onClick={onChange}
                      w="full"
                      justifyContent="space-between"
                    >
                      <Flex flexDirection="row" alignItems="center">
                        <MyAvatar src={member.avatar} w="32px" />
                        <Box ml="2">{member.memberName}</Box>
                      </Flex>
                      {!!collaborator && (
                        <PermissionTags permission={collaborator.permission.value} />
                      )}
                    </Flex>
                  </Flex>
                );
              })}
            </Flex>
          </Flex>
          <Flex p="4" flexDirection="column">
            <Box>
              {t('user:has_chosen') + ': '}+ {selectedMemberIdList.length}
            </Box>
            <Flex flexDirection="column" mt="2">
              {selectedMemberIdList.map((tmbId) => {
                const member = filterMembers.find((v) => v.tmbId === tmbId);
                return member ? (
                  <Flex
                    key={tmbId}
                    alignItems="center"
                    justifyContent="space-between"
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    _hover={{ bg: 'myGray.50' }}
                    _notLast={{ mb: 2 }}
                  >
                    <Avatar src={member.avatar} w="24px" />
                    <Box w="full" ml={2}>
                      {member.memberName}
                    </Box>
                    <MyIcon
                      name="common/closeLight"
                      w="16px"
                      cursor={'pointer'}
                      _hover={{
                        color: 'red.600'
                      }}
                      onClick={() =>
                        setSelectedMembers(selectedMemberIdList.filter((v) => v !== tmbId))
                      }
                    />
                  </Flex>
                ) : null;
              })}
            </Flex>
          </Flex>
        </MyBox>
      </ModalBody>
      <ModalFooter>
        <PermissionSelect
          value={selectedPermission}
          Button={
            <Flex
              alignItems={'center'}
              bg={'myGray.50'}
              border="base"
              fontSize={'sm'}
              px={3}
              borderRadius={'md'}
              h={'32px'}
            >
              {t(perLabel as any)}
              <ChevronDownIcon fontSize={'md'} />
            </Flex>
          }
          onChange={(v) => setSelectedPermission(v)}
        />
        <Button isLoading={isUpdating} ml="4" h={'32px'} onClick={onConfirm}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddMemberModal;
