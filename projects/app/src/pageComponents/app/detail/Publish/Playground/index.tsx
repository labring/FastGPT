import React, { useMemo } from 'react';
import { Box, Flex, Grid, Switch } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm, useWatch } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getPlaygroundVisibilityConfig,
  updatePlaygroundVisibilityConfig
} from '@/web/support/outLink/api';
import type { PlaygroundVisibilityConfigType } from '@fastgpt/global/support/outLink/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';

const defaultPlaygroundVisibilityForm: PlaygroundVisibilityConfigType = {
  showRunningStatus: true,
  showSkillReferences: false,
  showCite: true,
  showFullText: true,
  canDownloadSource: true,
  showWholeResponse: true
};

const PlaygroundVisibilityConfig = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  const { register, control, getValues, setValue, reset } = useForm({
    defaultValues: defaultPlaygroundVisibilityForm
  });

  const showCite = useWatch({ control, name: 'showCite' });
  const showFullText = useWatch({ control, name: 'showFullText' });
  const canDownloadSource = useWatch({ control, name: 'canDownloadSource' });
  const showRunningStatus = useWatch({ control, name: 'showRunningStatus' });
  const showWholeResponse = useWatch({ control, name: 'showWholeResponse' });

  const playgroundLink = useMemo(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/chat?appId=${appId}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`;
    }
    return '';
  }, [appId]);

  useRequest(() => getPlaygroundVisibilityConfig({ appId }), {
    onSuccess: (data) => {
      reset({
        showRunningStatus: data.showRunningStatus,
        showSkillReferences: data.showSkillReferences,
        showCite: data.showCite,
        showFullText: data.showFullText,
        canDownloadSource: data.canDownloadSource,
        showWholeResponse: data.showWholeResponse
      });
    },
    manual: false
  });

  const { runAsync: saveConfig } = useRequest(
    async (data: PlaygroundVisibilityConfigType) => {
      return await updatePlaygroundVisibilityConfig({
        appId,
        ...data
      });
    },
    {
      successToast: t('common:save_success')
    }
  );

  const autoSave = async () => {
    const values = getValues();
    await saveConfig(values);
  };

  const visibilityItemGridProps = {
    templateColumns: { base: 'minmax(0, 1fr) auto', sm: '140px auto' } as const,
    columnGap: '28px' as const,
    alignItems: 'center' as const
  };

  return (
    <Flex flexDirection="column">
      <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'} mb={3}>
        {t('app:publish.playground_link')}
      </Box>

      <Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'} mb={6}>
        <Flex
          p={3}
          bg={'myWhite.500'}
          border="base"
          borderTopLeftRadius={'md'}
          borderTopRightRadius={'md'}
          alignItems={'center'}
        >
          <Box flex={1} fontSize={'xs'} color={'myGray.600'}>
            {t('common:core.app.outLink.Link block title')}
          </Box>
          <MyIcon
            name={'copy'}
            w={'16px'}
            color={'myGray.600'}
            cursor={'pointer'}
            _hover={{ color: 'primary.500' }}
            onClick={() => copyData(playgroundLink)}
          />
        </Flex>
        <Box whiteSpace={'nowrap'} p={3} overflowX={'auto'}>
          {playgroundLink}
        </Box>
      </Box>

      <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
        {t('publish:private_config')}
      </Box>

      <Grid
        mt={4}
        w={'100%'}
        templateColumns={{ base: '1fr', sm: 'repeat(3, 1fr)' }}
        columnGap={6}
        rowGap={4}
        pb={4}
      >
        <Grid {...visibilityItemGridProps}>
          <FormLabel fontSize={'12px'} mb={0} whiteSpace={{ base: 'normal', sm: 'nowrap' }}>
            {t('publish:show_node')}
          </FormLabel>
          <Switch
            flexShrink={0}
            {...register('showRunningStatus', {
              onChange: autoSave
            })}
            isChecked={showRunningStatus}
          />
        </Grid>

        <Grid {...visibilityItemGridProps}>
          <Flex alignItems={'center'} gap={1}>
            <FormLabel fontSize={'12px'} mb={0} whiteSpace={{ base: 'normal', sm: 'nowrap' }}>
              {t('app:publish.show_whole_response')}
            </FormLabel>
            <QuestionTip label={t('app:publish.show_whole_response_tip')} />
          </Flex>
          <Switch
            flexShrink={0}
            {...register('showWholeResponse', {
              onChange: autoSave
            })}
            isChecked={showWholeResponse}
          />
        </Grid>

        <Box display={{ base: 'none', sm: 'block' }} />

        <Grid {...visibilityItemGridProps}>
          <Flex alignItems={'center'} gap={1}>
            <FormLabel fontSize={'12px'} mb={0} whiteSpace={{ base: 'normal', sm: 'nowrap' }}>
              {t('common:support.outlink.share.Response Quote')}
            </FormLabel>
            <QuestionTip label={t('common:support.outlink.share.Response Quote tips')} />
          </Flex>
          <Switch
            flexShrink={0}
            {...register('showCite', {
              onChange(e) {
                if (!e.target.checked) {
                  setValue('showFullText', false);
                  setValue('canDownloadSource', false);
                }
                autoSave();
              }
            })}
            isChecked={showCite}
          />
        </Grid>

        <Grid {...visibilityItemGridProps}>
          <Flex alignItems={'center'} gap={1}>
            <FormLabel fontSize={'12px'} mb={0} whiteSpace={{ base: 'normal', sm: 'nowrap' }}>
              {t('common:core.app.share.Show full text')}
            </FormLabel>
            <QuestionTip label={t('common:support.outlink.share.Show full text tips')} />
          </Flex>
          <Switch
            flexShrink={0}
            {...register('showFullText', {
              onChange(e) {
                if (!e.target.checked) {
                  setValue('canDownloadSource', false);
                } else {
                  setValue('showCite', true);
                }
                autoSave();
              }
            })}
            isChecked={showFullText}
          />
        </Grid>

        <Grid {...visibilityItemGridProps}>
          <Flex alignItems={'center'} gap={1}>
            <FormLabel fontSize={'12px'} mb={0} whiteSpace={{ base: 'normal', sm: 'nowrap' }}>
              {t('common:core.app.share.Download source')}
            </FormLabel>
            <QuestionTip label={t('common:support.outlink.share.Download source tips')} />
          </Flex>
          <Switch
            flexShrink={0}
            {...register('canDownloadSource', {
              onChange(e) {
                if (e.target.checked) {
                  setValue('showFullText', true);
                  setValue('showCite', true);
                }
                autoSave();
              }
            })}
            isChecked={canDownloadSource}
          />
        </Grid>
      </Grid>
    </Flex>
  );
};

export default PlaygroundVisibilityConfig;
