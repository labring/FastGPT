import React from 'react';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import SkillEmptyActionCard from '@/pageComponents/dashboard/skill/SkillEmptyActionCard';

type Props = {
  onClickImport: () => void;
  onClickCreate: () => void;
};

/**
 * Skill Dashboard 根目录空态：
 * 容器四边 padding 32px；标题与双卡间距 32px；双卡之间间距 24px。
 */
const SkillDashboardEmptyHero = ({ onClickImport, onClickCreate }: Props) => {
  const { t } = useTranslation();

  return (
    <Flex
      flexDirection={'column'}
      alignItems={'flex-start'}
      alignSelf={'stretch'}
      flexShrink={0}
      w={'full'}
      p={'32px'}
      gap={'32px'}
    >
      <Flex w={'full'} justifyContent={'center'} flexShrink={0}>
        <Flex alignItems={'center'} gap={'10px'} flexShrink={0}>
          <Image
            src={'/imgs/skill/createFirstSkillIcon.svg'}
            alt={''}
            w={'32px'}
            h={'32px'}
            flexShrink={0}
            display={'block'}
          />
          <Box color={'myGray.700'} fontSize={'32px'} fontWeight={500} lineHeight={'40px'}>
            {t('skill:create_your_first_skill')}
          </Box>
        </Flex>
      </Flex>

      <Flex
        w={'full'}
        justifyContent={'center'}
        alignItems={'stretch'}
        direction={['column', 'row']}
        gap={'24px'}
      >
        <SkillEmptyActionCard
          onClick={onClickImport}
          title={t('skill:import_existing_skill')}
          description={t('skill:import_existing_skill_desc')}
          variant={'import'}
          actionIconSrc={'/imgs/skill/importActionIcon.svg'}
        />
        <SkillEmptyActionCard
          onClick={onClickCreate}
          title={t('skill:create_skill')}
          description={t('skill:create_skill_desc')}
          variant={'create'}
          actionIconSrc={'/imgs/skill/createActionIcon.svg'}
        />
      </Flex>
    </Flex>
  );
};

export default SkillDashboardEmptyHero;
