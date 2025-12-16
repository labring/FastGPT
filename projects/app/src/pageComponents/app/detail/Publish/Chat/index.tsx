import React from 'react';
import { Box, Flex, Grid, Switch } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getChatVisibilityConfig, updateChatVisibilityConfig } from '@/web/support/outLink/api';
import type { ChatVisibilityConfigType } from '@fastgpt/global/core/app/type';

const defaultChatVisibilityForm: ChatVisibilityConfigType = {
  showNodeStatus: true,
  responseDetail: true,
  showFullText: true,
  showRawSource: true
};

const ChatVisibilityConfig = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();

  const { register, watch, setValue, reset } = useForm({
    defaultValues: defaultChatVisibilityForm
  });

  const responseDetail = watch('responseDetail');
  const showFullText = watch('showFullText');
  const showRawSource = watch('showRawSource');

  useRequest2(() => getChatVisibilityConfig({ appId }), {
    onSuccess: (data) => {
      reset({
        showNodeStatus: data.showNodeStatus,
        responseDetail: data.responseDetail,
        showFullText: data.showFullText,
        showRawSource: data.showRawSource
      });
    },
    manual: false
  });

  const { runAsync: saveConfig } = useRequest2(
    async (data: ChatVisibilityConfigType) => {
      return await updateChatVisibilityConfig({
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
      <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
        {t('publish:private_config')}
      </Box>

      <Grid templateColumns={'1fr 1fr'} gap={4} mt={4}>
        <Flex alignItems={'center'}>
          <FormLabel fontSize={'12px'} flex={'0 0 127px'}>
            {t('publish:show_node')}
          </FormLabel>
          <Switch
            {...register('showNodeStatus', {
              onChange: autoSave
            })}
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
            {...register('responseDetail', {
              onChange(e) {
                if (!e.target.checked) {
                  setValue('showFullText', false);
                  setValue('showRawSource', false);
                }
                autoSave();
              }
            })}
            isChecked={responseDetail}
          />
        </Flex>
      </Grid>

      <Grid templateColumns={'1fr 1fr'} gap={4} mt={4}>
        <Flex>
          <Flex alignItems={'center'} flex={'0 0 127px'}>
            <FormLabel fontSize={'12px'}>{t('common:core.app.share.Show full text')}</FormLabel>
            <QuestionTip ml={1} label={t('common:support.outlink.share.Show full text tips')} />
          </Flex>
          <Switch
            {...register('showFullText', {
              onChange(e) {
                if (!e.target.checked) {
                  setValue('showRawSource', false);
                } else {
                  setValue('responseDetail', true);
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
            {...register('showRawSource', {
              onChange(e) {
                if (e.target.checked) {
                  setValue('showFullText', true);
                  setValue('responseDetail', true);
                }
                autoSave();
              }
            })}
            isChecked={showRawSource}
          />
        </Flex>
      </Grid>
    </Flex>
  );
};

export default ChatVisibilityConfig;
