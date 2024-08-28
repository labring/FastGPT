import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { createContext, useContextSelector } from 'use-context-selector';
import TeamList from './TeamList';
import TeamCard from './TeamCard';
import { TeamModalContext, TeamModalContextProvider } from './context';

export const TeamContext = createContext<{}>({} as any);

type Props = { onClose: () => void };

const TeamManageModal = ({ onClose }: Props) => {
  const { Loading } = useLoading();
  const { isLoading } = useContextSelector(TeamModalContext, (v) => v);

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        maxW={['90vw', '1000px']}
        w={'100%'}
        h={'550px'}
        isCentered
        bg={'myWhite.600'}
        overflow={'hidden'}
      >
        <Box display={['block', 'flex']} flex={1} position={'relative'} overflow={'auto'}>
          <TeamList />
          <Box h={'100%'} flex={'1 0 0'}>
            <TeamCard />
          </Box>
          <Loading loading={isLoading} fixed={false} />
        </Box>
      </MyModal>
    </>
  );
};

const Render = (props: Props) => {
  const { userInfo } = useUserStore();

  return !!userInfo?.team ? (
    <TeamModalContextProvider>
      <TeamManageModal {...props} />
    </TeamModalContextProvider>
  ) : null;
};
export default React.memo(Render);
