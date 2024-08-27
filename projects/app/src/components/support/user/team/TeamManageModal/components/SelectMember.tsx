import React, { SetStateAction, useState } from 'react';
import { Box, Checkbox, Flex, Grid, Input, InputGroup, InputLeftElement } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';

type memberType = {
  tmbId: string;
  memberName: string;
  avatar: string;
};

function SelectMember({
  members,
  selected,
  setSelected
}: {
  members: memberType[];
  setSelected: React.Dispatch<SetStateAction<any>>;
  selected: memberType[];
}) {
  const [searchKey, setSearchKey] = useState('');
  const { t } = useTranslation();

  const filterMembers = members.filter((member) => {
    if (member.memberName.includes(searchKey)) return true;
    return false;
  });

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
  );
}

export default SelectMember;
