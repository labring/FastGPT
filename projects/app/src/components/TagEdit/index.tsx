import React, { useEffect, useMemo, useState } from 'react';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItemOption,
  MenuOptionGroup,
  Flex,
  TagLabel,
  TagCloseButton,
  HStack,
  Tag,
  Input
} from '@chakra-ui/react';
import type { TeamTagsSchema } from '@fastgpt/global/support/user/team/type';
const TagEdit = ({
  defaultValues,
  teamsTags,
  setSelectedTags
}: {
  defaultValues: [];
  teamsTags: Array<TeamTagsSchema>;
  setSelectedTags: (item: Array<string>) => void;
}) => {
  const [teamTagsOptions, setTeamTagsOptions] = useState(teamsTags);
  const setSelectTeamsTags = (item: any) => {
    setSelectedTags(item);
  };
  useMemo(() => {
    setTeamTagsOptions(teamsTags);
  }, [teamsTags]);
  return (
    <>
      <Menu closeOnSelect={false}>
        <MenuButton className="menu-btn" maxHeight={'250'} minWidth={'80%'}>
          <HStack
            style={{
              border: 'solid 2px #f3f3f3',
              borderRadius: '5px',
              padding: '3px',

              flexWrap: 'wrap',
              minHeight: '40px'
            }}
          >
            {teamsTags.map((item: TeamTagsSchema, index: number) => {
              const key: string = item?.key;
              if (defaultValues.indexOf(key as never) > -1) {
                return (
                  <Tag
                    key={index}
                    size={'md'}
                    colorScheme="red"
                    // maxWidth={"100px"}
                    borderRadius="full"
                  >
                    <TagLabel> {item.label}</TagLabel>
                    <TagCloseButton />
                  </Tag>
                );
              }
            })}
          </HStack>
        </MenuButton>
        <MenuList style={{ height: '300px', overflow: 'scroll' }}>
          <Input
            style={{ border: 'none', borderBottom: 'solid 1px #f6f6f6' }}
            placeholder="pleace "
            onChange={(e: any) => {
              // 对用户输入的搜索文本进行小写转换，以实现不区分大小写的搜索
              const searchLower: string = e?.nativeEvent?.data || '';
              // 使用filter方法来过滤列表，只返回包含搜索文本的项
              const resultList = teamsTags.filter((item) => {
                const searchValue = item.label || '';
                // 对列表中的每一项也进行小写转换
                return searchValue.includes(searchLower);
              });
              !searchLower ? setTeamTagsOptions(teamsTags) : setTeamTagsOptions(resultList);
            }}
          />
          <MenuOptionGroup
            defaultValue={defaultValues}
            type="checkbox"
            style={{ height: '300px', overflow: 'scroll' }}
            onChange={(e) => {
              setSelectTeamsTags(e);
            }}
          >
            {teamTagsOptions.map((item, index) => {
              return (
                <MenuItemOption key={index} value={item.key}>
                  {item?.label}
                </MenuItemOption>
              );
            })}
          </MenuOptionGroup>
        </MenuList>
      </Menu>
    </>
  );
};

export default TagEdit;
