import React from 'react';
import { Box, Button, Flex, Input, Textarea } from '@chakra-ui/react';
import { useForm, useWatch } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { postCreateSkill } from '@/web/core/skill/api';
import { useRouter } from 'next/router';

const DEFAULT_SKILL_AVATAR = 'core/skill/default';

type FormType = {
  avatar: string;
  name: string;
  intro?: string;
};

type Props = {
  parentId?: string | null;
  onClose: () => void;
};

const CreateSkillModal = ({ parentId, onClose }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();

  const { register, setValue, control, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: DEFAULT_SKILL_AVATAR,
      name: '',
      intro: ''
    }
  });

  const avatar = useWatch({ control, name: 'avatar' });

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(newAvatar) {
        setValue('avatar', newAvatar);
      }
    });

  const { runAsync: onCreate, loading: isCreating } = useRequest(
    async ({ avatar, name, intro }: FormType) => {
      return postCreateSkill({
        parentId: parentId ?? null,
        name: name.trim(),
        description: intro?.trim() || undefined,
        avatar: avatar || undefined
      });
    },
    {
      onSuccess(skillId) {
        onClose();
        router.push(`/skill/detail?skillId=${skillId}`);
      },
      errorToast: t('common:create_failed')
    }
  );

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        title={t('skill:create_skill')}
        size={'md'}
        isCentered
        borderRadius={'10px'}
        closeOnOverlayClick={false}
        footer={
          <>
            <Button variant={'whiteBase'} onClick={onClose}>
              {t('common:Cancel')}
            </Button>
            <Button isLoading={isCreating} onClick={handleSubmit((data) => onCreate(data))}>
              {t('common:Confirm')}
            </Button>
          </>
        }
      >
        <Flex flexDirection={'column'} gap={6}>
          {/* 图标 & 名称 */}
          <Box>
            <FormLabel mb={2}>{t('skill:skill_avatar_and_name')}</FormLabel>
            <Flex alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Flex
                  borderRadius={'6px'}
                  w={'34px'}
                  h={'34px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  justifyContent={'center'}
                  alignItems={'center'}
                  mr={3}
                  p={'4px'}
                  cursor={'pointer'}
                  onClick={handleAvatarSelectorOpen}
                >
                  <Avatar src={avatar} w={'24px'} borderRadius={'6px'} />
                </Flex>
              </MyTooltip>
              <Input
                flex={1}
                size={'sm'}
                placeholder={t('skill:skill_name_placeholder')}
                {...register('name', { required: true })}
              />
            </Flex>
          </Box>

          {/* 介绍 */}
          <Box>
            <FormLabel mb={2}>{t('skill:skill_intro_label')}</FormLabel>
            <Textarea
              {...register('intro')}
              h={'60px'}
              minH={'60px'}
              placeholder={t('skill:skill_intro_placeholder')}
              resize={'vertical'}
            />
          </Box>
        </Flex>
      </MyModal>
      <AvatarUploader />
    </>
  );
};

export default CreateSkillModal;
