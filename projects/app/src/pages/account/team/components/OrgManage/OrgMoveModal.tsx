import { Modal, ModalBody } from '@chakra-ui/react';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import type { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import OrgTree from './OrgTree';

function OrgMoveModal({ orgs, team }: { orgs: OrgType[]; team: TeamTmbItemType }) {
  return (
    <MyModal isOpen={true} title="move org">
      <ModalBody>
        <OrgTree orgs={orgs} teamName={team.teamName} teamAvatar={team.avatar} />
      </ModalBody>
    </MyModal>
  );
}

export default OrgMoveModal;
