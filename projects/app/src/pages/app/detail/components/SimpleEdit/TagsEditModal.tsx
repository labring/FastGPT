import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Button,
  Flex,
  Box,
  ModalFooter,
  ModalBody,
  Menu,
  MenuButton,
  HStack,
  Tag,
  TagCloseButton,
  MenuList,
  Input,
  MenuOptionGroup,
  MenuItemOption,
  TagLabel
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getTeamsTags } from '@/web/support/user/team/api';
import { useQuery } from '@tanstack/react-query';

const TagsEditModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { appDetail } = useAppStore();
  const { toast } = useToast();
  const { replaceAppDetail } = useAppStore();
  const [selectedTags, setSelectedTags] = useState<string[]>(appDetail?.teamTags || []);

  // submit config
  const { mutate: saveSubmitSuccess, isLoading: btnLoading } = useRequest({
    mutationFn: async () => {
      await replaceAppDetail(appDetail._id, {
        teamTags: selectedTags
      });
    },
    onSuccess() {
      onClose();
      toast({
        title: t('common.Update Success'),
        status: 'success'
      });
    },
    errorToast: t('common.Update Failed')
  });

  const { data: teamTags = [] } = useQuery(['getTeamsTags'], getTeamsTags);
  const [searchKey, setSearchKey] = useState('');
  const filterTeamTags = teamTags.filter((item) => {
    return item.label.includes(searchKey);
  }, []);

  return (
    <MyModal
      style={{ width: '900px' }}
      isOpen
      onClose={onClose}
      iconSrc="/imgs/module/ai.svg"
      title={t('core.app.Team tags')}
    >
      <ModalBody>
        <Box mb={3} fontWeight="semibold">
          {t('团队标签')}
        </Box>
        <Menu closeOnSelect={false}>
          <MenuButton className="menu-btn" maxHeight={'250'} w={'100%'}>
            <Flex
              alignItems={'center'}
              borderWidth={'1px'}
              borderColor={'borderColor.base'}
              borderRadius={'md'}
              px={3}
              py={2}
              flexWrap={'wrap'}
              minH={'50px'}
              gap={3}
            >
              {teamTags.map((item, index) => {
                const key: string = item?.key;
                if (selectedTags.indexOf(key as never) > -1) {
                  return (
                    <Tag key={index} size={'md'} colorScheme="blue" borderRadius="full">
                      <TagLabel>{item.label}</TagLabel>
                      <TagCloseButton />
                    </Tag>
                  );
                }
              })}
            </Flex>
          </MenuButton>
          <MenuList>
            <Box px={2}>
              <Input
                m={'auto'}
                placeholder={t('core.app.Search team tags')}
                value={searchKey}
                onChange={(e) => {
                  setSearchKey(e.target.value);
                }}
              />
            </Box>
            <Box maxH={'300px'} overflow={'auto'} mt={1}>
              <MenuOptionGroup
                defaultValue={selectedTags}
                type="checkbox"
                onChange={(e) => {
                  //@ts-ignore
                  setSelectedTags(e);
                }}
              >
                {filterTeamTags.map((item) => {
                  return (
                    <MenuItemOption
                      key={item.key}
                      value={item.key}
                      borderRadius={'md'}
                      _hover={{ bg: 'myGray.100' }}
                    >
                      {item?.label}
                    </MenuItemOption>
                  );
                })}
              </MenuOptionGroup>
            </Box>
          </MenuList>
        </Menu>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button isLoading={btnLoading} onClick={(e) => saveSubmitSuccess(e)}>
          {t('common.Save')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};
export default TagsEditModal;
