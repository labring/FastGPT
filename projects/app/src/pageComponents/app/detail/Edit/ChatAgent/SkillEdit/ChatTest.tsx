import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { SkillEditType } from '@fastgpt/global/core/app/formEdit/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../../context';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { cardStyles } from '../../../constants';
import HelperBot from '@/components/core/chat/HelperBot';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { useToast } from '@fastgpt/web/hooks/useToast';

type Props = {
  skill: SkillEditType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
};
const ChatTest = ({ skill, setAppForm }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // 构建 SkillAgent metadata,从 appForm 中提取配置
  const skillAgentMetadata = useMemo(() => ({}), []);

  return (
    <MyBox display={'flex'} position={'relative'} flexDirection={'column'} h={'full'} py={4}>
      <Flex px={[2, 5]} pb={2}>
        <Box color={'myGray.900'} fontWeight={'bold'} flex={1}>
          {t('app:skill_editor')}
        </Box>
        <MyTooltip label={t('common:core.chat.Restart')}>
          <IconButton
            className="chat"
            size={'smSquare'}
            icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
            variant={'whiteDanger'}
            borderRadius={'md'}
            aria-label={'delete'}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        </MyTooltip>
      </Flex>
      <Box flex={1}>
        <HelperBot
          type={HelperBotTypeEnum.skillEditor}
          metadata={skillAgentMetadata}
          onApply={(e) => {
            console.log(e);
          }}
        />
      </Box>
    </MyBox>
  );
};

export default React.memo(ChatTest);
