import { ChevronRightIcon } from '@chakra-ui/icons';

export default function VariableLabel({
  variableKey,
  variableLabel,
  nodeAvatar
}: {
  variableKey: string;
  variableLabel: string;
  nodeAvatar: string;
}) {
  const [parentLabel, childLabel] = variableLabel.split('.');

  return (
    <span
      style={{
        display: 'inline-block',
        margin: '0 2px',
        border: '1px solid #E8EBF0',
        borderRadius: '4px',
        padding: '2px 4px'
      }}
    >
      <span>
        <img src={nodeAvatar} style={{ width: '16px', display: 'inline', margin: '0 2px' }} />
      </span>
      <span>{parentLabel}</span>
      <span>
        <ChevronRightIcon />
      </span>
      <span>{childLabel}</span>
    </span>
  );
}
