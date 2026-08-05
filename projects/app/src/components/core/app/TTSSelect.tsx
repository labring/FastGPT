import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, Button, Flex, ModalBody, useDisclosure, HStack } from '@chakra-ui/react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { TTSTypeEnum } from '@/web/core/app/constants';
import type { AppTTSConfigType } from '@fastgpt/global/core/app/type';
import { useAudioPlay } from '@/web/common/utils/voice';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySlider from '@/components/Slider';
import { defaultTTSConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MultipleRowSelect from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';

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
  value = defaultTTSConfig,
  onChange
}: {
  value?: AppTTSConfigType;
  onChange: (e: AppTTSConfigType) => void;
}) => {
  const { t, i18n } = useTranslation();
  const { ttsModelList, getModelProvider } = useSystemStore();
  const { isOpen, onOpen, onClose } = useDisclosure();

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
      ...ttsModelList.map((model) => {
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
          value: model.model,
          children:
            model.voices?.map((voice) => ({
              label: voice.label,
              value: voice.value
            })) || []
        };
      })
    ],
    [getModelProvider, i18n.language, t, ttsModelList]
  );

  const formatValue = useMemo(() => {
    if (!value || !value.type) {
      return [TTSTypeEnum.none, undefined];
    }
    if (value.type === TTSTypeEnum.none || value.type === TTSTypeEnum.web) {
      return [value.type, undefined];
    }

    return [value.model, value.voice];
  }, [value]);
  const formLabel = useMemo(() => {
    const provider = selectorList.find((item) => item.value === formatValue[0]) || selectorList[0];
    const voice = provider.children.find((item) => item.value === formatValue[1]);

    return (
      <Box w={'100%'} minW={0}>
        {voice ? (
          <Flex maxW={['180px', '250px']} minW={0} overflow={'hidden'} alignItems={'center'}>
            <Box minW={0} flex={'1 1 auto'} overflow={'hidden'}>
              {provider.label}
            </Box>
            <Box px={1} flexShrink={0}>
              /
            </Box>
            <Box minW={0} flex={'1 1 auto'} className={'textEllipsis'}>
              {voice.label}
            </Box>
          </Flex>
        ) : (
          provider.label
        )}
      </Box>
    );
  }, [formatValue, selectorList]);

  const { playAudioByText, cancelAudio, audioLoading, audioPlaying } = useAudioPlay({
    appId,
    ttsConfig: value
  });

  const onclickChange = useCallback(
    (e: string[]) => {
      console.log(e, '-=');
      if (e[0] === TTSTypeEnum.none || e[0] === TTSTypeEnum.web) {
        onChange({ type: e[0] });
      } else {
        onChange({
          ...value,
          type: TTSTypeEnum.model,
          model: e[0],
          voice: e[1]
        });
      }
    },
    [onChange, value]
  );

  const onCloseTTSModal = useCallback(() => {
    cancelAudio();
    onClose();
  }, [cancelAudio, onClose]);

  return (
    <Flex alignItems={'center'} w={'100%'} minW={0}>
      <MyIcon name={'core/app/simpleMode/tts'} mr={2} w={'20px'} />
      <FormLabel>{t('common:core.app.TTS')}</FormLabel>
      <ChatFunctionTip type={'tts'} />
      <Box flex={'1 1 0'} minW={3} />
      <MyTooltip label={t('common:core.app.Select TTS')}>
        <Button
          variant={'transparentBase'}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          minW={0}
          maxW={['180px', '260px']}
          onClick={onOpen}
          color={'myGray.600'}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        iconSrc="core/app/simpleMode/tts"
        title={t('common:core.app.TTS')}
        isOpen={isOpen}
        onClose={onCloseTTSModal}
        w={'500px'}
      >
        <ModalBody px={[5, 16]} py={[4, 8]}>
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
          {formatValue[0] !== TTSTypeEnum.none && (
            <Flex mt={10} justifyContent={'end'}>
              {audioPlaying ? (
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
              )}
            </Flex>
          )}
        </ModalBody>
      </MyModal>
    </Flex>
  );
};

export default TTSSelect;
