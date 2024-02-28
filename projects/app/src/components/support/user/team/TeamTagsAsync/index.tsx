import React, { useEffect, useMemo, useState } from 'react';
import MyModal from '@/components/MyModal';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  Tag,
  ModalFooter,
  Input,
  HStack,
  Avatar
} from '@chakra-ui/react';
import { AttachmentIcon, CopyIcon, DragHandleIcon } from '@chakra-ui/icons';
import { putUpdateTeamTags, updateTags } from '@/web/support/user/team/api';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import type { TeamTagsSchema } from '@fastgpt/global/support/user/team/type';
import { useRequest } from '@/web/common/hooks/useRequest';
import { RepeatIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCopyData } from '@/web/common/hooks/useCopyData';

const TeamTagsAsync = ({
  teamsTags,
  teamInfo,
  onClose
}: {
  teamsTags: Array<TeamTagsSchema>;
  teamInfo: any;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [_teamsTags, setTeamTags] = useState<Array<TeamTagsSchema>>(teamsTags);

  const { register, setValue, getValues, handleSubmit } = useForm<any>({
    defaultValues: { ...teamInfo }
  });
  const { copyData } = useCopyData();
  const baseUrl = global.feConfigs?.customSharePageDomain || location?.origin;
  const linkUrl = `${baseUrl}/chat/team?shareTeamId=${teamInfo?._id}${
    getValues('showHistory') ? '' : '&showHistory=0'
  }`;

  // tags Async
  const { mutate: onclickAsync, isLoading: creating } = useRequest({
    mutationFn: async (data: any) => {
      return putUpdateTeamTags({ tagsUrl: data.tagsUrl, teamId: teamInfo?._id });
    },
    onSuccess(id: string) {
      onClose();
    },
    successToast: t('user.team.Team Tags Async Success'),
    errorToast: t('common.Create Failed')
  });
  const asyncTags = async () => {
    console.log('getValues', getValues());
    const res: Array<TeamTagsSchema> = await updateTags(teamInfo?._id, getValues().tagsUrl);
    setTeamTags(res);
    toast({ status: 'success', title: '团队标签同步成功' });
  };
  useEffect(() => {
    console.log('teamInfo', teamInfo);
  }, []);

  // 获取
  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        maxW={['70vw', '1000px']}
        w={'100%'}
        h={'550px'}
        iconSrc="/imgs/modal/team.svg"
        isCentered
        bg={'white'}
        overflow={'hidden'}
        title={
          <Box>
            <Box>{teamInfo?.name}</Box>
            <Box color={'myGray.500'} fontSize={'xs'} fontWeight={'normal'}>
              {'填写标签同步链接，点击同步按钮即可同步'}
            </Box>
          </Box>
        }
      >
        <ModalBody style={{ padding: '10rpx' }}>
          <Flex mt={3} alignItems={'center'}>
            <Box mb={2} fontWeight="semibold">
              {t('同步链接')}
            </Box>
            <Input
              flex={1}
              ml={4}
              autoFocus
              bg={'myWhite.600'}
              placeholder="请输入同步标签"
              {...register('tagsUrl', {
                required: t('core.app.error.App name can not be empty')
              })}
            />
          </Flex>
          <Flex mt={3} alignItems={'center'}>
            <Box mb={2} fontWeight="semibold">
              {t('分享链接')}
            </Box>
            {/* code */}
            <Box ml={4} borderRadius={'md'} overflow={'hidden'}>
              <Flex>
                <Box whiteSpace={'pre'} p={3} overflowX={'auto'} bg={'myWhite.600'} color="blue">
                  {linkUrl}
                </Box>
                <MyIcon
                  name={'copy'}
                  w={'16px'}
                  p={3}
                  bg={'primary.500'}
                  color={'myWhite.600'}
                  cursor={'pointer'}
                  _hover={{ bg: 'primary.400' }}
                  onClick={() => {
                    copyData(linkUrl);
                  }}
                />
              </Flex>
            </Box>
          </Flex>
          <Flex mt={3} alignItems={'center'}>
            <Box mb={2} fontWeight="semibold">
              {t('标签列表')}
            </Box>
            <HStack
              ml={4}
              maxHeight={'250'}
              bg={'myWhite.600'}
              style={{
                border: 'solid 2px #f3f3f377',
                borderRadius: '5px',
                padding: '10px',
                maxWidth: '70%',
                flexWrap: 'wrap',
                overflow: 'scroll'
              }}
              spacing={1}
            >
              {_teamsTags.map((item, index) => {
                return (
                  <Tag key={index} mt={2} size={'md'} colorScheme="red" borderRadius="full">
                    <Avatar
                      src="https://bit.ly/sage-adeb"
                      size="xs"
                      name={item.label}
                      ml={-2}
                      mr={2}
                    />
                    {item.label}
                  </Tag>
                );
              })}
            </HStack>
            <Button ml={4} size="md" leftIcon={<RepeatIcon />} onClick={asyncTags}>
              立即同步
            </Button>
          </Flex>
        </ModalBody>
        <ModalFooter mb={2}>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common.Close')}
          </Button>
          <Button isLoading={creating} onClick={handleSubmit((data) => onclickAsync(data))}>
            {t('user.team.Tags Async')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(TeamTagsAsync);
