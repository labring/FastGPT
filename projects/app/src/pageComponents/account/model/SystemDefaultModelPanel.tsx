import React, { useMemo, useState } from 'react';
import { Box, Flex, ModalBody, ModalFooter, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { getSystemDefault, getModelList, putUpdateDefaultModels } from '@/web/core/ai/config';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  GetSystemDefaultModelResponse,
  UpdateSystemDefaultModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ModelListItem } from '@fastgpt/global/openapi/core/ai/model/api';

type DefaultModelField = {
  key: keyof UpdateSystemDefaultModelBody;
  type: `${ModelTypeEnum}`;
  scene: keyof GetSystemDefaultModelResponse;
  label: string;
  tip: string;
  /** Only vision-capable llm models are selectable (dataset image understanding) */
  visionOnly?: boolean;
  /** Allow clearing the config (falls back to first enabled system model) */
  canBeUnset?: boolean;
};

/**
 * System default model config panel (design §11.1).
 * root picks the default model for each of the 9 scenes; only enabled SYSTEM
 * models are selectable. Unconfigured scenes fall back on the server side.
 */
const SystemDefaultModelPanel = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t } = useTranslation(['config_model', 'common']);

  const { data: current } = useRequest(getSystemDefault, { manual: false, errorToast: '' });
  const { data: activeModelList = [], loading: loadingModels } = useRequest(
    () => getModelList({ isActive: 'active' }),
    { manual: false, errorToast: '' }
  );

  const [formValues, setFormValues] = useState<UpdateSystemDefaultModelBody>({});

  // Backfill the form once the current default config is loaded. Adjusted
  // during render (React "adjusting state during rendering" pattern) instead
  // of an effect, keyed by the request data reference.
  const [lastCurrent, setLastCurrent] = useState<typeof current>();
  if (current && current !== lastCurrent) {
    setLastCurrent(current);
    setFormValues({
      llmId: current.llm?.id ?? null,
      embeddingId: current.embedding?.id ?? null,
      ttsId: current.tts?.id ?? null,
      sttId: current.stt?.id ?? null,
      rerankId: current.rerank?.id ?? null,
      datasetTextLLMId: current.datasetTextLLM?.id ?? null,
      datasetImageLLMId: current.datasetImageLLM?.id ?? null,
      chatTitleLLMId: current.chatTitleLLM?.id ?? null,
      helperBotLLMId: current.helperBotLLM?.id ?? null
    });
  }

  // Only system models are candidates for the system defaults
  const systemModelsByType = useMemo(() => {
    const map: Record<string, ModelListItem[]> = {};
    activeModelList
      .filter((item) => item.isSystem)
      .forEach((item) => {
        map[item.type] = map[item.type] ?? [];
        map[item.type].push(item);
      });
    return map;
  }, [activeModelList]);

  const defaultModelFields: DefaultModelField[] = [
    {
      key: 'llmId',
      type: ModelTypeEnum.llm,
      scene: 'llm',
      label: 'default_model_scene_llm',
      tip: 'default_model_scene_llm_tip'
    },
    {
      key: 'embeddingId',
      type: ModelTypeEnum.embedding,
      scene: 'embedding',
      label: 'default_model_scene_embedding',
      tip: 'default_model_scene_embedding_tip'
    },
    {
      key: 'ttsId',
      type: ModelTypeEnum.tts,
      scene: 'tts',
      label: 'default_model_scene_tts',
      tip: 'default_model_scene_tts_tip'
    },
    {
      key: 'sttId',
      type: ModelTypeEnum.stt,
      scene: 'stt',
      label: 'default_model_scene_stt',
      tip: 'default_model_scene_stt_tip'
    },
    {
      key: 'rerankId',
      type: ModelTypeEnum.rerank,
      scene: 'rerank',
      label: 'default_model_scene_rerank',
      tip: 'default_model_scene_rerank_tip'
    },
    {
      key: 'datasetTextLLMId',
      type: ModelTypeEnum.llm,
      scene: 'datasetTextLLM',
      label: 'default_model_scene_dataset_text',
      tip: 'default_model_scene_dataset_text_tip'
    },
    {
      key: 'datasetImageLLMId',
      type: ModelTypeEnum.llm,
      scene: 'datasetImageLLM',
      label: 'default_model_scene_dataset_image',
      tip: 'default_model_scene_dataset_image_tip',
      visionOnly: true
    },
    {
      key: 'chatTitleLLMId',
      type: ModelTypeEnum.llm,
      scene: 'chatTitleLLM',
      label: 'default_model_scene_chat_title',
      tip: 'default_model_scene_chat_title_tip',
      canBeUnset: true
    },
    {
      key: 'helperBotLLMId',
      type: ModelTypeEnum.llm,
      scene: 'helperBotLLM',
      label: 'default_model_scene_helper_bot',
      tip: 'default_model_scene_helper_bot_tip',
      canBeUnset: true
    }
  ];

  const { runAsync: onSave, loading: saving } = useRequest(putUpdateDefaultModels, {
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    successToast: t('common:update_success'),
    errorToast: t('common:update_failed')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('config_model:default_model_config')}
      iconSrc="modal/edit"
      w={'720px'}
      isLoading={!current || loadingModels}
    >
      <ModalBody py={5}>
        <Flex
          mb={4}
          p={3}
          borderRadius={'md'}
          bg={'primary.50'}
          fontSize={'sm'}
          color={'myGray.700'}
        >
          {t('config_model:default_model_panel_alert')}
        </Flex>

        <Flex flexDirection={'column'} gap={4}>
          {defaultModelFields.map((field) => {
            const typeModels = systemModelsByType[field.type] ?? [];
            const candidateList = field.visionOnly
              ? typeModels.filter((item) => item.vision)
              : typeModels;

            return (
              <Flex key={field.key} alignItems={'center'}>
                <Box flex={'0 0 200px'} fontSize={'sm'} fontWeight={500} color={'myGray.900'}>
                  {t(field.label as any)}
                </Box>
                <Box flex={'1 0 0'} minW={0}>
                  <AIModelSelector
                    type={field.type}
                    value={formValues[field.key] ?? ''}
                    list={candidateList.map((item) => ({ value: item.id, label: item.name }))}
                    canBeUnset={field.canBeUnset}
                    unsetLabel={t('config_model:not_set_chat_title_model')}
                    onChange={(e) => {
                      setFormValues((state) => ({
                        ...state,
                        [field.key]: e ? e : null
                      }));
                    }}
                  />
                </Box>
              </Flex>
            );
          })}
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={saving} onClick={() => onSave(formValues)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(SystemDefaultModelPanel);
