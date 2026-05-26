import React from 'react';
import { Box, Button, Flex, Input, Textarea } from '@chakra-ui/react';
import { useForm, useWatch } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
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
  requirement: string;
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
      intro: '',
      requirement: t('skill:skill_requirement_default')
    }
  });

  const avatar = useWatch({ control, name: 'avatar' });
  const requirement = useWatch({ control, name: 'requirement' });

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(newAvatar) {
        setValue('avatar', newAvatar);
      }
    });

  const { runAsync: onCreate, loading: isCreating } = useRequest(
    async ({ avatar, name, intro, requirement }: FormType) => {
      const trimmedRequirement = requirement.trim();
      const defaultRequirement = t('skill:skill_requirement_default').trim();
      const resolvedRequirement =
        trimmedRequirement && trimmedRequirement !== defaultRequirement
          ? trimmedRequirement
          : undefined;

      return postCreateSkill({
        parentId: parentId ?? null,
        name: name.trim(),
        description: intro?.trim() || undefined,
        requirements: resolvedRequirement,
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

          {/* Skill 需求 */}
          <Box>
            <Flex alignItems={'center'} mb={2}>
              <FormLabel>
                <Box as="span" color={'red.600'} mr={0.5}>
                  *
                </Box>
                {t('skill:skill_requirement_label')}
              </FormLabel>
              <MyPopover
                trigger={'hover'}
                placement={'right-start'}
                hasArrow={false}
                p={0}
                w={'320px'}
                Trigger={
                  <Box ml={1} display={'inline-flex'} alignItems={'center'} cursor={'default'}>
                    <MyIcon name={'help' as any} w={'16px'} color={'myGray.500'} />
                  </Box>
                }
              >
                {() => (
                  <Box p={'12px'}>
                    <Box fontSize={'xs'} color={'#333'} mb={2}>
                      {t('skill:skill_requirement_tooltip_title')}
                    </Box>
                    <Box
                      fontSize={'xs'}
                      color={'#333'}
                      border={'1px solid #E8EBF0'}
                      borderRadius={'4px'}
                      p={'10px'}
                      whiteSpace={'pre-wrap'}
                      cursor={'default'}
                    >
                      {t('skill:skill_requirement_tooltip_example')}
                    </Box>
                  </Box>
                )}
              </MyPopover>
            </Flex>
            <Textarea
              value={requirement}
              onChange={(e) => setValue('requirement', e.target.value)}
              h={'150px'}
              minH={'150px'}
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
