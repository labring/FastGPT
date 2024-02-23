import React, { useCallback, useState, useEffect } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { Button, Flex, Box, ModalFooter, ModalBody } from '@chakra-ui/react';
import TagsEdit from '@/components/TagEdit';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { TeamTagsSchema } from '@fastgpt/global/support/user/team/type';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import { useRequest } from '@/web/common/hooks/useRequest';
import { getTeamsTags } from '@/web/support/user/team/api';
const TagsEditModal = ({ appDetail, onClose }: { appDetail?: any; onClose: () => void }) => {
  const { t } = useTranslation();
  const [teamsTags, setTeamTags] = useState<Array<TeamTagsSchema>>([]);
  const [selectedTags, setSelectedTags] = useState(appDetail?.teamTags);
  const { toast } = useToast();
  const { replaceAppDetail } = useAppStore();

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
  //

  // // 点击选择标签
  // const clickTag = (tagId :Number) => {
  //   const index = selectedTags.indexOf(tagId);
  //   if (index === -1) {
  //     // 如果 num 不在数组 arr 中，添加它
  //     setSelectedTags([tagId,...selectedTags])
  //   } else {
  //     const _selectedTags = [...selectedTags];
  //     _selectedTags.splice(index, 1);
  //     console.log('_selectedTags',_selectedTags);
  //     // 如果 num 已经在数组 arr 中，移除它
  //     setSelectedTags(_selectedTags);
  //   }
  // }

  useEffect(() => {
    // get team tags
    getTeamsTags(appDetail?.teamId).then((res: any) => {
      setTeamTags(res?.list);
    });
  }, []);

  return (
    <MyModal
      style={{ width: '900px' }}
      isOpen
      onClose={onClose}
      iconSrc="/imgs/module/ai.svg"
      title={'标签管理'}
    >
      <ModalBody>
        {/* <HStack spacing={2}>
        {teamsTags.map((item,index) => {
          return <Tag
                  key={index} 
                  size={'md'}
                  variant='outline' 
                  colorScheme={selectedTags.indexOf(item._id) > -1 ? 'green':'blue'  }
                  onClick={() => clickTag(item._id)}
                >
                  {item.label}
                </Tag>
        })}
        </HStack>  */}
        <Flex width={'100%'} alignItems={'center'}>
          <Box mb={3} mr={3} fontWeight="semibold">
            {t('团队标签')}
          </Box>
          <TagsEdit
            defaultValues={selectedTags}
            teamsTags={teamsTags}
            setSelectedTags={(item: Array<string>) => setSelectedTags(item)}
          />
        </Flex>
        <ModalFooter>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common.Close')}
          </Button>
          <Button isLoading={btnLoading} onClick={(e) => saveSubmitSuccess(e)}>
            {t('common.Save')}
          </Button>
        </ModalFooter>
      </ModalBody>
    </MyModal>
  );
};
export default TagsEditModal;
