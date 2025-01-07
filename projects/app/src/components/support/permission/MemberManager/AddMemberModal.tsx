import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from './context';
import { AddModalPropsType } from './MemberModal';
import MemberModal from './MemberModal';

function AddMemberModal({ onClose, mode = 'member' }: AddModalPropsType) {
  const context = useContextSelector(CollaboratorContext, (v) => v);
  return <MemberModal onClose={onClose} mode={mode} collaboratorContext={context} />;
}

export default AddMemberModal;
