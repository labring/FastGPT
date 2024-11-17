import { Box, Flex } from '@chakra-ui/react';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useTranslation } from 'next-i18next';
import React, { useRef } from 'react';

enum FnTypeEnum {
  inputGuide = 'inputGuide',
  nextQuestion = 'nextQuestion',
  tts = 'tts',
  variable = 'variable',
  welcome = 'welcome',
  file = 'file',
  visionModel = 'visionModel',
  instruction = 'instruction',
  autoExec = 'autoExec'
}

const ChatFunctionTip = ({ type }: { type: `${FnTypeEnum}` }) => {
  const { t } = useTranslation();

  const map = useRef({
    [FnTypeEnum.inputGuide]: {
      icon: '/imgs/app/inputGuide-icon.svg',
      title: t('chat:input_guide'),
      desc: t('chat:input_guide_tip'),
      imgUrl: '/imgs/app/inputGuide.svg'
    },
    [FnTypeEnum.nextQuestion]: {
      icon: '/imgs/app/nextQuestion-icon.svg',
      title: t('common:core.app.Question Guide'),
      desc: t('common:core.app.Question Guide Tip'),
      imgUrl: '/imgs/app/nextQuestion.svg'
    },
    [FnTypeEnum.tts]: {
      icon: '/imgs/app/tts-icon.svg',
      title: t('common:core.app.TTS'),
      desc: t('common:core.app.TTS Tip'),
      imgUrl: '/imgs/app/tts.svg'
    },
    [FnTypeEnum.variable]: {
      icon: '/imgs/app/variable-icon.svg',
      title: t('common:core.module.Variable'),
      desc: t('common:core.app.tip.variableTip'),
      imgUrl: '/imgs/app/variable.svg'
    },
    [FnTypeEnum.welcome]: {
      icon: '/imgs/app/welcome-icon.svg',
      title: t('common:core.app.Welcome Text'),
      desc: t('common:core.app.tip.welcomeTextTip'),
      imgUrl: '/imgs/app/welcome.svg'
    },
    [FnTypeEnum.file]: {
      icon: '/imgs/app/fileinput.svg',
      title: t('app:file_upload'),
      desc: t('app:file_upload_tip'),
      imgUrl: '/imgs/app/fileUploadPlaceholder.png'
    },
    [FnTypeEnum.visionModel]: {
      icon: '/imgs/app/question.svg',
      title: t('app:vision_model_title'),
      desc: t('app:open_vision_function_tip'),
      imgUrl: '/imgs/app/visionModel.svg'
    },
    [FnTypeEnum.instruction]: {
      icon: '/imgs/app/help.svg',
      title: t('workflow:plugin.Instructions'),
      desc: t('workflow:plugin.Instruction_Tip'),
      imgUrl: '/imgs/app/instruction.svg'
    },
    [FnTypeEnum.autoExec]: {
      icon: '/imgs/app/autoExec-icon.svg',
      title: t('common:core.app.Auto execute'),
      desc: t('app:auto_execute_tip'),
      imgUrl: '/imgs/app/autoExec.svg'
    }
  });
  const data = map.current[type];

  return (
    <QuestionTip
      maxW={'420px'}
      ml={1}
      label={
        <Box pt={2}>
          <Flex alignItems={'flex-start'}>
            <MyImage src={data.icon} w={'36px'} alt={''} />
            <Box ml={3}>
              <Box fontWeight="bold">{data.title}</Box>
              <Box fontSize={'xs'} color={'myGray.500'}>
                {data.desc}
              </Box>
            </Box>
          </Flex>
          <MyImage src={data.imgUrl} w={'100%'} minH={['auto', '250px']} mt={2} alt={''} />
        </Box>
      }
    />
  );
};

export default ChatFunctionTip;
