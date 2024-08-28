import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
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
import { putUpdateTeam } from '@/web/support/user/team/api';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import type { TeamTagItemType } from '@fastgpt/global/support/user/team/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { RepeatIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useQuery } from '@tanstack/react-query';
import { getTeamsTags, loadTeamTagsByDomain } from '@/web/support/user/team/api';

type FormType = {
  teamDomain: string;
  tags: TeamTagItemType[];
};

const TeamTagsAsync = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { userInfo, initUserInfo } = useUserStore();
  const { copyData } = useCopyData();

  const teamInfo = userInfo?.team;

  if (!teamInfo) {
    onClose();
    return null;
  }

  const { register, control, handleSubmit } = useForm<FormType>({
    defaultValues: {
      teamDomain: teamInfo.teamDomain,
      tags: []
    }
  });
  const { fields: teamTags, replace: replaceTeamTags } = useFieldArray({
    control,
    name: 'tags'
  });

  const baseUrl = global.feConfigs?.customSharePageDomain || location?.origin;
  const linkUrl = `${baseUrl}/chat/team?teamId=${teamInfo.teamId}&teamToken=`;

  // tags Async
  const { mutate: onclickUpdate, isLoading: isUpdating } = useRequest({
    mutationFn: async (data: FormType) => {
      return putUpdateTeam({ teamDomain: data.teamDomain });
    },
    onSuccess() {
      initUserInfo();
      onClose();
    },
    errorToast: t('common:common.Create Failed')
  });
  const { mutate: onclickTagAsync, isLoading: isSyncing } = useRequest({
    mutationFn: (data: FormType) => loadTeamTagsByDomain(data.teamDomain),
    onSuccess(res) {
      replaceTeamTags(res);
    },
    successToast: t('common:support.user.team.Team Tags Async Success')
  });

  useQuery(['getTeamsTags'], getTeamsTags, {
    onSuccess: (data) => {
      replaceTeamTags(data);
    }
  });

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
            <Box>{teamInfo?.teamName}</Box>
            <Box color={'myGray.500'} fontSize={'xs'} fontWeight={'normal'}>
              {t('user:synchronization.title')}
            </Box>
          </Box>
        }
      >
        <ModalBody style={{ padding: '10rpx' }}>
          <Flex mt={3} alignItems={'center'}>
            <Box mb={2} fontWeight="semibold">
              {t('common:sync_link')}
            </Box>
            <Input
              flex={1}
              ml={4}
              autoFocus
              bg={'myWhite.600'}
              placeholder={t('user:synchronization.placeholder')}
              {...register('teamDomain', {
                required: true
              })}
            />
          </Flex>
          <Flex mt={3} alignItems={'center'}>
            <Box mb={2} fontWeight="semibold">
              {t('common:share_link')}
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
              {t('common:tag_list')}
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
              {teamTags.map((item, index) => {
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
            <Button
              isLoading={isSyncing}
              ml={4}
              size="md"
              leftIcon={<RepeatIcon />}
              onClick={handleSubmit((data) => onclickTagAsync(data))}
            >
              {t('user:synchronization.button')}
            </Button>
          </Flex>
        </ModalBody>
        <ModalFooter mb={2}>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common:common.Close')}
          </Button>
          <Button isLoading={isUpdating} onClick={handleSubmit((data) => onclickUpdate(data))}>
            {t('common:user.team.Tags Async')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(TeamTagsAsync);
