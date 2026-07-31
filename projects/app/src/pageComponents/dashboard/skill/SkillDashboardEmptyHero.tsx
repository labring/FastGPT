import React from 'react';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import SkillEmptyActionCard from '@/pageComponents/dashboard/skill/SkillEmptyActionCard';

type Props = {
  onClickImport: () => void;
  onClickCreate: () => void;
};

const SkillDashboardEmptyHero = ({ onClickImport, onClickCreate }: Props) => {
  const { t } = useTranslation();

  return (
    <Flex
      flexDirection={'column'}
      alignItems={'flex-start'}
      alignSelf={'stretch'}
      flexShrink={0}
      w={'full'}
      p={8}
      gap={8}
    >
      <Flex w={'full'} justifyContent={'center'} flexShrink={0}>
        <Flex alignItems={'center'} gap={2.5} flexShrink={0}>
          <Image
            src={'/imgs/skill/createFirstSkillIcon.svg'}
            alt={''}
            w={8}
            h={8}
            flexShrink={0}
            display={'block'}
          />
          <Box color={'myGray.700'} fontSize={'3xl'} fontWeight={'medium'} lineHeight={'40px'}>
            {t('skill:create_your_first_skill')}
          </Box>
        </Flex>
      </Flex>

      <Flex
        w={'full'}
        justifyContent={'center'}
        alignItems={'stretch'}
        direction={['column', 'row']}
        gap={6}
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
