import React, { useState } from 'react';
import { Box, Checkbox, Flex, Grid, Input, InputGroup, InputLeftElement } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import { Control, Controller } from 'react-hook-form';

type memberType = {
  tmbId: string;
  memberName: string;
  avatar: string;
};

function SelectMember({
  allMembers,
  selected = [],
  setSelected
}: {
  allMembers: memberType[];
  selected?: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [searchKey, setSearchKey] = useState('');
  const { t } = useTranslation();

  const filterMembers = allMembers.filter((member) => {
    if (member.memberName.includes(searchKey)) return true;
    return false;
  });

  const selectedMembers = selected.map((item) => allMembers.find((member) => member.tmbId == item));

  return (
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
                  ...(!selectedMembers.includes(member) ? { svg: { color: 'myGray.50' } } : {})
                }}
                _notLast={{ mb: 2 }}
                onClick={() => {
                  if (selectedMembers.indexOf(member) == -1) {
                    setSelected([...selected, member.tmbId]);
                  } else {
                    setSelected([...selected.filter((item) => item != member.tmbId)]);
                  }
                }}
              >
                <Checkbox
                  isChecked={selectedMembers.includes(member)}
                  icon={<MyIcon name={'common/check'} w={'12px'} />}
                />
                <Avatar ml={2} src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                {member.memberName}
              </Flex>
            );
          })}
        </Flex>
      </Flex>
      <Flex borderLeft="1px" borderColor="myGray.200" flexDirection="column" p="4">
        <Box mt={3}>{t('common:chosen') + ': ' + selected.length} </Box>
        <Box mt={5}>
          {selectedMembers?.map((member) => {
            return (
              member && (
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
                      setSelected([...selected.filter((item) => item != member.tmbId)])
                    }
                  />
                </Flex>
              )
            );
          })}
        </Box>
      </Flex>
    </Grid>
  );
}

function controller({ control, allMembers }: { control: Control; allMembers: memberType[] }) {
  return (
    <Controller
      control={control}
      name="members"
      render={({ field: { value: selected, onChange } }) => (
        <SelectMember allMembers={allMembers} selected={selected} setSelected={onChange} />
      )}
    />
  );
}

// export default SelectMember;
export default controller;
