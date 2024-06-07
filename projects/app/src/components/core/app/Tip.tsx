import { useI18n } from '@/web/context/I18n';
import { Box, Flex, Image } from '@chakra-ui/react';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useTranslation } from 'next-i18next';
import React, { useRef } from 'react';

enum FnTypeEnum {
  inputGuide = 'inputGuide',
  nextQuestion = 'nextQuestion',
  tts = 'tts',
  variable = 'variable',
  welcome = 'welcome'
}

const ChatFunctionTip = ({ type }: { type: `${FnTypeEnum}` }) => {
  const { t } = useTranslation();
  const { chatT } = useI18n();

  const map = useRef({
    [FnTypeEnum.inputGuide]: {
      icon: '/imgs/app/inputGuide-icon.svg',
      title: chatT('Input guide'),
      desc: chatT('Input guide tip'),
      imgUrl: '/imgs/app/inputGuide.svg'
    },
    [FnTypeEnum.nextQuestion]: {
      icon: '/imgs/app/nextQuestion-icon.svg',
      title: t('core.app.Question Guide'),
      desc: t('core.app.Question Guide Tip'),
      imgUrl: '/imgs/app/nextQuestion.svg'
    },
    [FnTypeEnum.tts]: {
      icon: '/imgs/app/tts-icon.svg',
      title: t('core.app.TTS'),
      desc: t('core.app.TTS Tip'),
      imgUrl: '/imgs/app/tts.svg'
    },
    [FnTypeEnum.variable]: {
      icon: '/imgs/app/variable-icon.svg',
      title: t('core.module.Variable'),
      desc: t('core.app.tip.variableTip'),
      imgUrl: '/imgs/app/variable.svg'
    },
    [FnTypeEnum.welcome]: {
      icon: '/imgs/app/welcome-icon.svg',
      title: t('core.app.Welcome Text'),
      desc: t('core.app.tip.welcomeTextTip'),
      imgUrl: '/imgs/app/welcome.svg'
    }
  });
  const data = map.current[type];

  return (
    <QuestionTip
      maxW={'420px'}
      ml={1}
      label={
        <Box>
          <Flex>
            <Image src={data.icon} w={'36px'} alt={''} />
            <Box ml={3}>
              <Box fontWeight="bold">{data.title}</Box>
              <Box fontSize={'xs'} color={'myGray.500'}>
                {data.desc}
              </Box>
            </Box>
          </Flex>
          <Image src={data.imgUrl} w={'100%'} minH={['auto', '250px']} mt={2} alt={''} />
        </Box>
      }
    />
  );
};

export default ChatFunctionTip;
