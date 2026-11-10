import { Box, Button, Checkbox, HStack } from '@chakra-ui/react';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelDeprecationInformChannelEnum } from '@fastgpt/global/support/user/inform/constants';
import DateTimePicker from '@fastgpt/web/components/common/DateTimePicker';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { nanoid } from 'nanoid';
import React from 'react';
import {
  getModelDeprecationInformChannels,
  getPlannedDateBounds,
  getUTCDateLabel,
  getSelectableDeprecationModels
} from '@/pageComponents/admin/inform/modelDeprecationUtils';
import { postCreateModelDeprecationInform } from '@/web/admin/system/inform/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

/** 创建模型下架通知计划；成功后可在同一 modal 切换到发送记录。 */
const ModelDeprecationInformModal = ({
  models,
  onClose,
  onShowHistory
}: {
  models: ModelConfigListItem[];
  onClose: () => void;
  onShowHistory: () => void;
}) => {
  const { t } = useSafeTranslation();
  const [plannedDate, setPlannedDate] = React.useState<Date>();
  const [sendExternal, setSendExternal] = React.useState(true);
  const [plannedDateBounds] = React.useState(() => getPlannedDateBounds());
  const requestId = React.useRef<string>();
  const selectableModels = React.useMemo(() => getSelectableDeprecationModels(models), [models]);
  const selectedModels = selectableModels.map((model) => model.modelId);
  const { runAsync: createPlan, loading } = useRequest(postCreateModelDeprecationInform, {
    manual: true,
    successToast: t('config_model:model_deprecation.create_success'),
    onSuccess: onShowHistory
  });

  const canSubmit = selectedModels.length > 0 && !!plannedDate;

  return (
    <MyModal
      title={t('config_model:model_deprecation.send_title')}
      onClose={onClose}
      w={'480px'}
      footer={
        <>
          <Button variant={'whiteBase'} mr={'auto'} onClick={onShowHistory}>
            {t('config_model:model_deprecation.view_history')}
          </Button>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            isLoading={loading}
            isDisabled={!canSubmit}
            onClick={() => {
              if (!plannedDate) return;
              requestId.current ??= nanoid();
              return createPlan({
                requestId: requestId.current,
                models: selectedModels,
                plannedDeprecationAt: getUTCDateLabel(plannedDate),
                channels: getModelDeprecationInformChannels([
                  ModelDeprecationInformChannelEnum.inApp,
                  ...(sendExternal ? (['email_or_sms'] as const) : [])
                ])
              });
            }}
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Box color={'myGray.700'} lineHeight={'20px'}>
        <Box>{t('config_model:model_deprecation.send_description')}</Box>
      </Box>
      <Box mt={4} mb={2} lineHeight={'20px'}>
        {t('config_model:model_deprecation.planned_date')}
      </Box>
      <DateTimePicker
        selectedDateTime={plannedDate}
        disabled={[{ before: plannedDateBounds.min }, { after: plannedDateBounds.max }]}
        timeZone={'UTC'}
        h={'2rem'}
        onChange={(value) => {
          requestId.current = undefined;
          setPlannedDate(value);
        }}
      />
      <HStack mt={4} spacing={6}>
        <Checkbox isChecked isDisabled>
          {t('config_model:model_deprecation.channel_in_app')}
        </Checkbox>
        <Checkbox
          isChecked={sendExternal}
          onChange={() => {
            requestId.current = undefined;
            setSendExternal((current) => !current);
          }}
        >
          {t('config_model:model_deprecation.channel_email')}
        </Checkbox>
      </HStack>
    </MyModal>
  );
};

export default ModelDeprecationInformModal;
