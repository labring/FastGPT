import React, { useMemo } from 'react';
import { Box, Flex, Grid, Switch } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
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
  showCite: true,
  showFullText: true,
  canDownloadSource: true
};

const PlaygroundVisibilityConfig = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  const { register, watch, setValue, reset } = useForm({
    defaultValues: defaultPlaygroundVisibilityForm
  });

  const showCite = watch('showCite');
  const showFullText = watch('showFullText');
  const canDownloadSource = watch('canDownloadSource');
  const showRunningStatus = watch('showRunningStatus');

  const playgroundLink = useMemo(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/chat?appId=${appId}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`;
    }
    return '';
  }, [appId]);

  useRequest2(() => getPlaygroundVisibilityConfig({ appId }), {
    onSuccess: (data) => {
      reset({
        showRunningStatus: data.showRunningStatus,
        showCite: data.showCite,
        showFullText: data.showFullText,
        canDownloadSource: data.canDownloadSource
      });
    },
    manual: false
  });

  const { runAsync: saveConfig } = useRequest2(
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
    const values = watch();
    await saveConfig(values);
  };

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

      <Grid templateColumns={'1fr 1fr'} gap={4} mt={4} w={'400px'}>
        <Flex alignItems={'center'}>
          <FormLabel fontSize={'12px'} flex={'0 0 127px'}>
            {t('publish:show_node')}
          </FormLabel>
          <Switch
            {...register('showRunningStatus', {
              onChange: autoSave
            })}
            isChecked={showRunningStatus}
          />
        </Flex>
        <Flex>
          <Flex alignItems={'center'} flex={'0 0 158px'}>
            <FormLabel fontSize={'12px'}>
              {t('common:support.outlink.share.Response Quote')}
            </FormLabel>
            <QuestionTip ml={1} label={t('common:support.outlink.share.Response Quote tips')} />
          </Flex>
          <Switch
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
        </Flex>
        <Flex>
          <Flex alignItems={'center'} flex={'0 0 127px'}>
            <FormLabel fontSize={'12px'}>{t('common:core.app.share.Show full text')}</FormLabel>
            <QuestionTip ml={1} label={t('common:support.outlink.share.Show full text tips')} />
          </Flex>
          <Switch
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
        </Flex>
        <Flex>
          <Flex alignItems={'center'} flex={'0 0 158px'}>
            <FormLabel fontSize={'12px'} fontWeight={'medium'}>
              {t('common:core.app.share.Download source')}
            </FormLabel>
            <QuestionTip ml={1} label={t('common:support.outlink.share.Download source tips')} />
          </Flex>
          <Switch
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
        </Flex>
      </Grid>
    </Flex>
  );
};

export default PlaygroundVisibilityConfig;
