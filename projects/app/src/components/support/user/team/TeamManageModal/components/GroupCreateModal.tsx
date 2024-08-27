import { Box, Input, HStack, ModalBody, Flex, Button, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useForm } from 'react-hook-form';
import SelectMember from './SelectMember';
import { useContextSelector } from 'use-context-selector';
import { TeamModalContext } from '../context';
import { postCreateGroup } from '@/web/support/user/team/group/api';

function GroupCreateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { File: AvatarSelect, onOpen: onOpenSelectAvatar } = useSelectFile({
    fileType: '*.jpg;*.jpeg;*.png;',
    multiple: false
  });
  const { register, handleSubmit, getValues } = useForm({
    defaultValues: {
      name: ''
    }
  });

  const {
    data: avatar,
    loading: uploadingAvatar,
    run: onSelectAvatar
  } = useRequest2(async (file: File[]) => {
    const src = await compressImgFileAndUpload({
      type: MongoImageTypeEnum.groupAvatar,
      file: file[0],
      maxW: 300,
      maxH: 300
    });
    return src;
  });

  const { run: submit, loading: isLoading } = useRequest2(
    async () => {
      postCreateGroup({
        members: selected.map((item) => {
          return item.tmbId;
        }),
        name: getValues('name'),
        avatar: avatar
      });
    },
    {
      onSuccess: onClose
    }
  );

  const { Loading } = useLoading();
  const { members } = useContextSelector(TeamModalContext, (v) => v);
  const [selected, setSelected] = useState<typeof members>([]);

  return (
    <MyModal
      onClose={onClose}
      title={t('user:team.group.create')}
      iconSrc="support/permission/collaborator"
      iconColor="primary.600"
      minW={'1000px'}
    >
      <ModalBody>
        <Flex flexDirection={'column'} gap={4}>
          <HStack>
            {uploadingAvatar && <Loading />}
            <FormLabel w="80px">{t('user:team.group.avatar')}</FormLabel>
            <Avatar src={avatar} w={'32px'} />
            <HStack
              ml={2}
              cursor={'pointer'}
              onClick={onOpenSelectAvatar}
              _hover={{ color: 'primary.600' }}
            >
              <MyIcon name="edit" w={'14px'} />
              <Box fontSize={'sm'}>{t('common:common.Edit')}</Box>
            </HStack>
          </HStack>
          <HStack>
            <FormLabel w="80px" required minW="fit-content">
              {t('user:team.group.name')}
            </FormLabel>
            <Input
              bgColor="myGray.50"
              {...register('name', { required: true })}
              placeholder={t('user:team.group.name')}
            />
          </HStack>
          <Flex>
            <FormLabel w="80px">{t('user:team.group.members')}</FormLabel>
            <Box flexGrow={1}>
              <SelectMember members={members} selected={selected} setSelected={setSelected} />
            </Box>
          </Flex>
        </Flex>
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button isLoading={isLoading} onClick={handleSubmit(submit)}>
          {t('common:new_create')}
        </Button>
      </ModalFooter>
      <AvatarSelect onSelect={onSelectAvatar} />
    </MyModal>
  );
}

export default GroupCreateModal;
