import AIModelSelector from '@/components/Select/AIModelSelector';
import { putUpdateDefaultModels } from '@/web/core/ai/config';
import { Box, Button, Flex } from '@chakra-ui/react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';
import type {
  LLMSystemModelDataType,
  SystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

type DefaultModelState = Record<keyof ModelDefaultIds, SystemModelDataType | undefined>;

const labelStyles = {
  fontSize: 'sm',
  color: 'myGray.900',
  mb: 0.5
};

const DefaultModelField = ({
  label,
  tip,
  modelType,
  models,
  value,
  mt = 4,
  canBeUnset,
  unsetLabel,
  onChange
}: {
  label: ReactNode;
  tip?: string;
  modelType: ModelTypeEnum;
  models: SystemModelDataType[];
  value?: string;
  mt?: number;
  canBeUnset?: boolean;
  unsetLabel?: string;
  onChange: (modelId: string) => void;
}) => (
  <Box mt={mt}>
    <Flex {...labelStyles} alignItems="center">
      <Box mr={tip ? 0.5 : 0}>{label}</Box>
      {tip && <QuestionTip label={tip} />}
    </Flex>
    <AIModelSelector
      modelType={modelType}
      bg="myGray.50"
      value={value}
      canBeUnset={canBeUnset}
      unsetLabel={unsetLabel}
      list={models.map((model) => ({ value: model.modelId, label: model.name }))}
      onChange={onChange}
    />
  </Box>
);

/** 管理所有默认模型槽位，并将重复选择交互收敛到一个字段模块。 */
const DefaultModelModal = ({
  models,
  defaultModelIds,
  onSuccess,
  onClose
}: {
  models: SystemModelDataType[];
  defaultModelIds: ModelDefaultIds;
  onSuccess: () => void | Promise<void>;
  onClose: () => void;
}) => {
  const { t } = useClientTranslation('config_model');
  const activeModels = useMemo(() => models.filter((model) => model.isActive), [models]);
  const modelsByType = useMemo(
    () =>
      new Map(
        Object.values(ModelTypeEnum).map((type) => [
          type,
          activeModels.filter((model) => model.type === type)
        ])
      ),
    [activeModels]
  );
  const llmModels = activeModels.filter(
    (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
  );
  const visionModels = llmModels.filter((model) => !!model.config.vision);
  const [defaultData, setDefaultData] = useState<DefaultModelState>(
    () =>
      Object.fromEntries(
        Object.entries(defaultModelIds).map(([key, modelId]) => [
          key,
          models.find((model) => model.modelId === modelId)
        ])
      ) as DefaultModelState
  );

  const setDefaultModel = ({
    slot,
    candidates,
    modelId
  }: {
    slot: keyof ModelDefaultIds;
    candidates: SystemModelDataType[];
    modelId: string;
  }) => {
    setDefaultData((state) => ({
      ...state,
      [slot]: candidates.find((model) => model.modelId === modelId)
    }));
  };

  const { runAsync, loading } = useRequest(putUpdateDefaultModels, {
    onSuccess: () => {
      onClose();
      void Promise.resolve(onSuccess()).catch(() => {});
    },
    successToast: t('common:update_success')
  });

  const typeFields = [
    { slot: ModelTypeEnum.llm, label: t('common:model.type.chat') },
    { slot: ModelTypeEnum.embedding, label: t('common:model.type.embedding') },
    { slot: ModelTypeEnum.tts, label: t('common:model.type.tts') },
    { slot: ModelTypeEnum.stt, label: t('common:model.type.stt') },
    { slot: ModelTypeEnum.rerank, label: t('common:model.type.reRank') }
  ] as const;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('config_model:default_model_config')}
      footer={
        <>
          <Button variant="whiteBase" onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            isLoading={loading}
            onClick={() =>
              runAsync({
                [ModelTypeEnum.llm]: defaultData.llm?.modelId,
                [ModelTypeEnum.embedding]: defaultData.embedding?.modelId,
                [ModelTypeEnum.tts]: defaultData.tts?.modelId,
                [ModelTypeEnum.stt]: defaultData.stt?.modelId,
                [ModelTypeEnum.rerank]: defaultData.rerank?.modelId,
                datasetTextLLMModelId: defaultData.datasetTextLLM?.modelId,
                datasetImageLLMModelId: defaultData.datasetImageLLM?.modelId,
                chatTitleLLMModelId: defaultData.chatTitleLLM?.modelId
              })
            }
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Box>
        {typeFields.map(({ slot, label }, index) => {
          const candidates = modelsByType.get(slot) ?? [];
          return (
            <DefaultModelField
              key={slot}
              label={label}
              modelType={slot}
              models={candidates}
              value={defaultData[slot]?.modelId}
              mt={index === 0 ? 0 : 4}
              onChange={(modelId) => setDefaultModel({ slot, candidates, modelId })}
            />
          );
        })}

        <MyDivider />
        <DefaultModelField
          label={t('common:core.ai.model.Dataset Agent Model')}
          tip={t('common:dataset_text_model_tip')}
          modelType={ModelTypeEnum.llm}
          models={llmModels}
          value={defaultData.datasetTextLLM?.modelId}
          onChange={(modelId) =>
            setDefaultModel({ slot: 'datasetTextLLM', candidates: llmModels, modelId })
          }
        />
        <DefaultModelField
          label={t('config_model:vlm_model')}
          tip={t('config_model:vlm_model_tip')}
          modelType={ModelTypeEnum.llm}
          models={visionModels}
          value={defaultData.datasetImageLLM?.modelId}
          onChange={(modelId) =>
            setDefaultModel({ slot: 'datasetImageLLM', candidates: visionModels, modelId })
          }
        />
        <DefaultModelField
          label={t('config_model:chat_title_model')}
          tip={t('config_model:chat_title_model_tip')}
          modelType={ModelTypeEnum.llm}
          models={llmModels}
          value={defaultData.chatTitleLLM?.modelId ?? ''}
          canBeUnset
          unsetLabel={t('config_model:not_set_chat_title_model')}
          onChange={(modelId) =>
            setDefaultModel({ slot: 'chatTitleLLM', candidates: llmModels, modelId })
          }
        />
      </Box>
    </MyModal>
  );
};

export default DefaultModelModal;
