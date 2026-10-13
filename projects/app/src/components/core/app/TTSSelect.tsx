import { ModelStatusLabel } from '@/components/Select/ModelStatusLabel';
import MySlider from '@/components/Slider';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useAudioPlay } from '@/web/common/utils/voice';
import { useModelDetail } from '@/web/core/ai/model/useModelDetail';
import { useModelList } from '@/web/core/ai/model/useModelList';
import { useModelSummary } from '@/web/core/ai/model/useModelSummary';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { Box, Button, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { defaultTTSConfig } from '@fastgpt/global/core/app/constants';
import type { AppTTSConfigType } from '@fastgpt/global/core/app/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MultipleRowSelect from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import AppConfigItem, { AppConfigItemAction } from './AppConfigItem';
import ChatFunctionTip from './Tip';

type TTSSelectorItemType = {
  alias: string;
  avatar?: string;
  label: string | React.ReactNode;
  value: string;
  children: {
    label: string;
    value: string;
  }[];
};

const TTSSelect = ({
  value: inputValue,
  onChange
}: {
  value?: AppTTSConfigType;
  onChange: (e: AppTTSConfigType) => void;
}) => {
  const { t, i18n } = useTranslation();
  const value = inputValue ?? defaultTTSConfig;
  const { getModelProvider } = useUserModelStore();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { modelList: ttsModels } = useModelList({ enabled: isOpen, modelType: ModelTypeEnum.tts });
  const isBuiltin = value.type === TTSTypeEnum.none || value.type === TTSTypeEnum.web;
  const modelId = isBuiltin ? undefined : (value.modelId ?? value.model);
  const detailState = useModelSummary({ modelId });
  const { setFromCatalog } = detailState;
  const { model: selectedTtsModel } = useModelDetail({ modelId, modelType: ModelTypeEnum.tts });

  const appId = useContextSelector(AppContext, (v) => v.appId);

  const selectorList = useMemo(
    (): TTSSelectorItemType[] => [
      {
        alias: t('app:tts_close'),
        label: t('app:tts_close'),
        value: TTSTypeEnum.none,
        children: []
      },
      {
        alias: t('app:tts_browser'),
        label: t('app:tts_browser'),
        value: TTSTypeEnum.web,
        children: []
      },
      ...ttsModels.map((model) => {
        const providerData = getModelProvider(model.provider, i18n.language);
        const modelName = t(model.name as any);
        return {
          alias: modelName,
          avatar: providerData.avatar,
          label: (
            <HStack minW={0} maxW={'100%'}>
              <Avatar borderRadius={'0'} w={'1.25rem'} flexShrink={0} src={providerData.avatar} />
              <Box minW={0} className={'textEllipsis'}>
                {modelName}
              </Box>
            </HStack>
          ),
          value: model.modelId,
          children:
            (model.type === ModelTypeEnum.tts ? model.config.voices : []).map((voice) => ({
              label: voice.label,
              value: voice.value
            })) || []
        };
      })
    ],
    [getModelProvider, i18n.language, t, ttsModels]
  );

  const formatValue = useMemo(() => {
    if (isBuiltin) {
      return [value.type, undefined];
    }
    return [modelId, value.voice];
  }, [isBuiltin, modelId, value.type, value.voice]);
  const formLabel = useMemo(() => {
    const provider = selectorList.find((item) => item.value === formatValue[0]);
    const voice = selectedTtsModel?.config.voices.find((item) => item.value === formatValue[1]);
    if (isBuiltin) return provider?.label;
    return (
      <Flex maxW={['180px', '250px']} minW={0} overflow="hidden" alignItems="center" gap={1}>
        <ModelStatusLabel modelId={modelId} {...detailState} />
        {detailState.detail?.status === 'active' && voice && (
          <Box className="textEllipsis">/ {voice.label}</Box>
        )}
      </Flex>
    );
  }, [detailState, formatValue, isBuiltin, modelId, selectorList, selectedTtsModel]);

  const { playAudioByText, cancelAudio, audioLoading, audioPlaying } = useAudioPlay({
    appId,
    ttsConfig: value
  });

  const onclickChange = useCallback(
    (e: string[]) => {
      if (!e[0]) return;
      if (e[0] === TTSTypeEnum.none || e[0] === TTSTypeEnum.web) {
        onChange({ type: e[0] });
      } else {
        const model = ttsModels.find((model) => model.modelId === e[0]);
        if (model) setFromCatalog(model);
        onChange({
          ...value,
          type: TTSTypeEnum.model,
          modelId: e[0],
          model: undefined,
          voice: e[1]
        });
      }
    },
    [onChange, setFromCatalog, ttsModels, value]
  );

  const onCloseTTSModal = useCallback(() => {
    cancelAudio();
    onClose();
  }, [cancelAudio, onClose]);

  return (
    <>
      <AppConfigItem
        icon={'core/app/simpleMode/tts'}
        label={t('common:core.app.TTS')}
        tip={<ChatFunctionTip type={'tts'} />}
        action={
          <AppConfigItemAction
            tooltip={t('common:core.app.Select TTS')}
            minW={0}
            maxW={['180px', '260px']}
            onClick={onOpen}
          >
            {formLabel}
          </AppConfigItemAction>
        }
      />
      <MyModal
        title={t('common:core.app.TTS')}
        isOpen={isOpen}
        onClose={onCloseTTSModal}
        w={'500px'}
        isCentered
        footer={
          <>
            {formatValue[0] !== TTSTypeEnum.none &&
              (audioPlaying ? (
                <Flex>
                  <MyImage src="/icon/speaking.gif" w={'24px'} alt={''} />
                  <Button
                    ml={2}
                    variant={'grayBase'}
                    color={'primary.600'}
                    isLoading={audioLoading}
                    leftIcon={<MyIcon name={'core/chat/stopSpeech'} w={'16px'} />}
                    onClick={cancelAudio}
                  >
                    {t('common:core.chat.tts.Stop Speech')}
                  </Button>
                </Flex>
              ) : (
                <Button
                  variant={'whiteBase'}
                  isDisabled={!isBuiltin && detailState.detail?.status !== 'active'}
                  isLoading={audioLoading}
                  leftIcon={<MyIcon name={'core/app/headphones'} w={'16px'} />}
                  onClick={() => {
                    playAudioByText({
                      text: t('common:core.app.tts.Test Listen Text')
                    });
                  }}
                >
                  {t('common:core.app.tts.Test Listen')}
                </Button>
              ))}
            <Button onClick={onCloseTTSModal}>{t('common:Confirm')}</Button>
          </>
        }
      >
        <Flex justifyContent={'space-between'} alignItems={'center'}>
          <FormLabel>{t('common:core.app.tts.Speech model')}</FormLabel>
          <MultipleRowSelect
            rowMinWidth="160px"
            label={<Box minW={'150px'}>{formLabel}</Box>}
            value={formatValue}
            list={selectorList}
            onSelect={onclickChange}
          />
        </Flex>
        <Flex mt={8} justifyContent={'space-between'}>
          <FormLabel>{t('common:core.app.tts.Speech speed')}</FormLabel>
          <MySlider
            markList={[
              { label: '0.3', value: 0.3 },
              { label: '2', value: 2 }
            ]}
            width={'220px'}
            min={0.3}
            max={2}
            step={0.1}
            value={value.speed || 1}
            onChange={(e) => {
              onChange({
                ...value,
                speed: e
              });
            }}
          />
        </Flex>
      </MyModal>
    </>
  );
};

export default TTSSelect;
