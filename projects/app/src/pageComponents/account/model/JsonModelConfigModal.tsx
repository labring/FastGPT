import { getModelConfigJson, putUpdateWithJson } from '@/web/core/ai/config';
import { Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useState } from 'react';

/** 管理系统模型 JSON 的加载、确认覆盖和成功反馈。 */
const JsonModelConfigModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) => {
  const { t } = useClientTranslation('config_model');
  const { toast } = useToast();
  const [data, setData] = useState('');
  const { loading } = useRequest(getModelConfigJson, {
    manual: false,
    onSuccess: setData
  });

  return (
    <MyModal
      isOpen
      isLoading={loading}
      onClose={onClose}
      title={t('config_model:model.json_config')}
      size="md"
      h="80vh"
      overflow="hidden"
      bodyStyles={{ overflow: 'hidden' }}
      footer={
        <>
          <Button variant="whiteBase" onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <PopoverConfirm
            Trigger={<Button>{t('common:Confirm')}</Button>}
            type="info"
            closeOnBlur={false}
            content={t('config_model:model.json_config_confirm')}
            onConfirm={async () => {
              await putUpdateWithJson({ config: data });
              toast({ title: t('common:update_success'), status: 'success' });
              onClose();
              void onSuccess().catch(() => {});
            }}
          />
        </>
      }
    >
      <JsonEditor value={data} onChange={setData} h="100%" />
    </MyModal>
  );
};

export default JsonModelConfigModal;
