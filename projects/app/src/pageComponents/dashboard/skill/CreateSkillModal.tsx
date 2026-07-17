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
  onSuccess?: (skillId: string) => void | Promise<void>;
  /** 创建成功后在新标签页打开详情；默认 false 在当前页跳转。 */
  openDetailInNewTab?: boolean;
};

const CreateSkillModal = ({ parentId, onClose, onSuccess, openDetailInNewTab = false }: Props) => {
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

  const { runAsync: createSkill, loading: isCreating } = useRequest(
    async ({ avatar, name, intro }: FormType) => {
      return postCreateSkill({
        parentId: parentId ?? null,
        name: name.trim(),
        description: intro?.trim() || undefined,
        avatar: avatar || undefined
      });
    },
    {
      errorToast: t('common:create_failed')
    }
  );

  const handleConfirm = () => {
    // 需要新标签页时，在「确认」点击的同步用户手势内先预建空白窗口，
    // 避免 await 创建请求之后脱离手势被 Safari / 严格弹窗策略拦截。
    // 注：此处不能用 noopener —— 需保留窗口句柄以便创建成功后设置 location；
    // 目标页为同源可信路由，opener 暴露风险可接受。
    const popup = openDetailInNewTab ? window.open('', '_blank') : null;

    const onValid = async (data: FormType) => {
      let skillId: string;
      try {
        skillId = await createSkill(data);
      } catch {
        // 创建失败：关掉预建窗口（useRequest 已展示错误提示）。
        popup?.close();
        return;
      }

      // 创建成功后立即关闭弹窗：后续回调失败不应让弹窗卡住，也不应掩盖创建已成功。
      onClose();

      // 打开详情页：新标签页模式下若窗口被拦截则不跳走当前页（如 Agent 编辑器）；
      // 当前页模式下直接 router.push。
      const detailUrl = `/skill/detail?skillId=${skillId}`;
      if (openDetailInNewTab) {
        if (popup && !popup.closed) {
          popup.location.href = detailUrl;
        }
      } else {
        await router.push(detailUrl);
      }

      // 创建后的关联/刷新交给调用方，由调用方自行处理异常。
      await onSuccess?.(skillId);
    };

    const onInvalid = () => {
      // 校验未通过（如名称为空）：关掉预建窗口，不留空白标签页。
      popup?.close();
    };

    handleSubmit(onValid, onInvalid)();
  };

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
            <Button isLoading={isCreating} onClick={handleConfirm}>
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
