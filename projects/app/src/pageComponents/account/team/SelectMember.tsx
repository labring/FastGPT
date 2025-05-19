import React, { useMemo, useState } from 'react';
import { Box, Checkbox, Flex, Grid, HStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import { Control, Controller } from 'react-hook-form';
import { RequireAtLeastOne } from '@fastgpt/global/common/type/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';

type memberType = {
  type: 'member';
  tmbId: string;
  memberName: string;
  avatar: string;
};

type groupType = {
  type: 'group';
  _id: string;
  name: string;
  avatar: string;
};

type selectedType = {
  member: string[];
  group: string[];
};

function SelectMember({
  allMembers,
  selected = { member: [], group: [] },
  setSelected
  // mode = 'both'
}: {
  allMembers: {
    member: memberType[];
    group: groupType[];
  };
  selected?: selectedType;
  setSelected: React.Dispatch<React.SetStateAction<selectedType>>;
  mode?: 'member' | 'group' | 'both';
}) {
  const [searchKey, setSearchKey] = useState('');
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const filtered = useMemo(() => {
    return [
      ...allMembers.member.filter((member) => {
        if (member.memberName.toLowerCase().includes(searchKey.toLowerCase())) return true;
        return false;
      }),
      ...allMembers.group.filter((member) => {
        if (member.name.toLowerCase().includes(searchKey.toLowerCase())) return true;
        return false;
      })
    ];
  }, [searchKey, allMembers]);

  const selectedFlated = useMemo(() => {
    return [
      ...allMembers.member.filter((member) => {
        return selected.member?.includes(member.tmbId);
      }),
      ...allMembers.group.filter((member) => {
        return selected.group?.includes(member._id);
      })
    ];
  }, [selected, allMembers]);

  const handleToggleSelect = (member: memberType | groupType) => {
    if (member.type == 'member') {
      if (selected.member?.indexOf(member.tmbId) == -1) {
        setSelected({
          member: [...selected.member, member.tmbId],
          group: [...selected.group]
        });
      } else {
        setSelected({
          member: [...selected.member.filter((item) => item != member.tmbId)],
          group: [...selected.group]
        });
      }
    } else {
      if (selected.group?.indexOf(member._id) == -1) {
        setSelected({ member: [...selected.member], group: [...selected.group, member._id] });
      } else {
        setSelected({
          member: [...selected.member],
          group: [...selected.group.filter((item) => item != member._id)]
        });
      }
    }
  };

  const isSelected = (member: memberType | groupType) => {
    if (member.type == 'member') {
      return selected.member?.includes(member.tmbId);
    } else {
      return selected.group?.includes(member._id);
    }
  };

  return (
    <Grid
      templateColumns="1fr 1fr"
      borderRadius="8px"
      border="1px solid"
      borderColor="myGray.200"
      h={'100%'}
    >
      <Flex flexDirection="column" p="4" h={'100%'} overflow={'auto'}>
        <SearchInput
          placeholder={t('user:search_user')}
          fontSize="sm"
          bg={'myGray.50'}
          onChange={(e) => {
            setSearchKey(e.target.value);
          }}
        />
        <Flex flexDirection="column" mt={3}>
          {filtered.map((member) => {
            return (
              <HStack
                py="2"
                px={3}
                borderRadius={'md'}
                alignItems="center"
                key={member.type == 'member' ? member.tmbId : member._id}
                cursor={'pointer'}
                _hover={{
                  bg: 'myGray.50',
                  ...(!isSelected(member) ? { svg: { color: 'myGray.50' } } : {})
                }}
                _notLast={{ mb: 2 }}
                onClick={() => handleToggleSelect(member)}
              >
                <Checkbox
                  isChecked={!!isSelected(member)}
                  icon={<MyIcon name={'common/check'} w={'12px'} />}
                />
                <Avatar src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                <Box>
                  {member.type == 'member'
                    ? member.memberName
                    : member.name === DefaultGroupName
                      ? userInfo?.team.teamName
                      : member.name}
                </Box>
              </HStack>
            );
          })}
        </Flex>
      </Flex>
      <Flex
        borderLeft="1px"
        borderColor="myGray.200"
        flexDirection="column"
        p="4"
        h={'100%'}
        overflow={'auto'}
      >
        <Box mt={3}>
          {t('common:chosen') + ': ' + Number(selected.member.length + selected.group.length)}{' '}
        </Box>
        <Box mt={5}>
          {selectedFlated.map((member) => {
            return (
              <HStack
                justifyContent="space-between"
                py="2"
                px={3}
                borderRadius={'md'}
                key={member.type == 'member' ? member.tmbId : member._id}
                _hover={{ bg: 'myGray.50' }}
                _notLast={{ mb: 2 }}
              >
                <Avatar src={member.avatar} w="1.5rem" borderRadius={'md'} />
                <Box w="full">
                  {member.type == 'member'
                    ? member.memberName
                    : member.name === DefaultGroupName
                      ? userInfo?.team.teamName
                      : member.name}
                </Box>
                <MyIcon
                  name={'common/closeLight'}
                  w={'1rem'}
                  cursor={'pointer'}
                  _hover={{ color: 'red.600' }}
                  onClick={() => handleToggleSelect(member)}
                />
              </HStack>
            );
          })}
        </Box>
      </Flex>
    </Grid>
  );
}

// This function is for using with react-hook-form
function ControllerWrapper({
  control,
  allMembers,
  mode = 'both',
  name = 'members'
}: {
  control: Control;
  allMembers: RequireAtLeastOne<{ member?: memberType[]; group?: groupType[] }>;
  mode?: 'member' | 'group' | 'both';
  name?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value: selected, onChange } }) => (
        <SelectMember
          mode={mode}
          allMembers={
            (() => {
              switch (mode) {
                case 'member':
                  return { member: allMembers.member, group: [] };
                case 'group':
                  return { member: [], group: allMembers.group };
                case 'both':
                  return { member: allMembers.member, group: allMembers.group };
              }
            })() as Required<typeof allMembers>
          }
          selected={(() => {
            switch (mode) {
              case 'member':
                return { member: selected, group: [] };
              case 'group':
                return { member: [], group: selected };
              case 'both':
                return { member: selected.member, group: selected.group };
            }
          })()}
          setSelected={
            (({ member, group }: selectedType, _prevState: selectedType) => {
              switch (mode) {
                case 'member':
                  onChange(member);
                  return;
                case 'group':
                  onChange(group);
                  return;
                case 'both':
                  onChange({ member, group });
                  return;
              }
            }) as any // hack: we do not need to handle prevState
          }
        />
      )}
    />
  );
}
export const UnControlledSelectMember = SelectMember;
export default ControllerWrapper;
