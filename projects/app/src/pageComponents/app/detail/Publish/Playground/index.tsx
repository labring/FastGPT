import React, { useMemo } from 'react';
import { Box, Flex, Grid, Switch, useBreakpointValue } from '@chakra-ui/react';
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
  const isDesktop = useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false;

  const { register, control, getValues, setValue, reset } = useForm({
    defaultValues: defaultPlaygroundVisibilityForm
  });

  const showCite = useWatch({ control, name: 'showCite' });
  const showFullText = useWatch({ control, name: 'showFullText' });
  const canDownloadSource = useWatch({ control, name: 'canDownloadSource' });
  const showRunningStatus = useWatch({ control, name: 'showRunningStatus' });
  const showSkillReferences = useWatch({ control, name: 'showSkillReferences' });
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

  const visibilityGridProps = {
    templateColumns: 'max-content auto' as const,
    columnGap: '40px' as const,
    rowGap: 4,
    alignItems: 'center' as const
  };

  const leftColumnItems = (
    <>
      <FormLabel fontSize={'12px'} mb={0} whiteSpace={'nowrap'}>
        {t('publish:show_node')}
      </FormLabel>
      <Switch
        flexShrink={0}
        {...register('showRunningStatus', {
          onChange: autoSave
        })}
        isChecked={showRunningStatus}
      />
      <Flex alignItems={'center'} gap={1}>
        <FormLabel fontSize={'12px'} mb={0} whiteSpace={'nowrap'}>
          {t('publish:show_skill_reference')}
        </FormLabel>
        <QuestionTip label={t('publish:show_skill_reference_tips')} />
      </Flex>
      <Switch
        flexShrink={0}
        {...register('showSkillReferences', {
          onChange(e) {
            if (e.target.checked) {
              setValue('showRunningStatus', true);
            }
            autoSave();
          }
        })}
        isChecked={showSkillReferences}
      />
      <Flex alignItems={'center'} gap={1}>
        <FormLabel fontSize={'12px'} mb={0} whiteSpace={'nowrap'}>
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
      <Flex alignItems={'center'} gap={1}>
        <FormLabel fontSize={'12px'} mb={0} whiteSpace={'nowrap'}>
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
    </>
  );

  const rightColumnItems = (
    <>
      <Flex alignItems={'center'} gap={1}>
        <FormLabel fontSize={'12px'} mb={0} whiteSpace={'nowrap'}>
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
      <Flex alignItems={'center'} gap={1}>
        <FormLabel fontSize={'12px'} mb={0} whiteSpace={'nowrap'}>
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
    </>
  );

  return (
    <Flex flexDirection="column" h="100%">
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

      {isDesktop ? (
        <Grid mt={4} templateColumns={'1fr 1fr'} columnGap={'24px'} rowGap={4} alignItems={'start'}>
          <Grid {...visibilityGridProps}>{leftColumnItems}</Grid>
          <Grid {...visibilityGridProps} justifySelf={'start'}>
            {rightColumnItems}
          </Grid>
        </Grid>
      ) : (
        <Grid {...visibilityGridProps} mt={4}>
          {leftColumnItems}
          {rightColumnItems}
        </Grid>
      )}
    </Flex>
  );
};

export default PlaygroundVisibilityConfig;
