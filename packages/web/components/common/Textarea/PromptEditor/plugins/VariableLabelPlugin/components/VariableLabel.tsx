import { ChevronRightIcon } from '@chakra-ui/icons';
import { DEFAULT_PARENT_ID } from '@fastgpt/global/common/string/constant';

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
    <>
      <span
        style={{
          display: 'inline-flex',
          margin: '2px 2px',
          borderRadius: '4px',
          backgroundColor: '#F4F4F7',
          padding: '3px 4px',
          color: '#111824',
          alignItems: 'center'
        }}
        hidden={parentLabel === 'undefined'}
      >
        <span hidden={parentLabel === DEFAULT_PARENT_ID}>
          <img
            src={nodeAvatar}
            style={{
              width: '12px',
              display: 'inline-block',
              margin: '0 4px 0 0'
            }}
          />
          <span>{parentLabel}</span>
          <span>
            <ChevronRightIcon />
          </span>
        </span>
        <span>{childLabel}</span>
      </span>
      <span
        style={{
          display: 'inline-block',
          margin: '2px 2px',
          borderRadius: '4px',
          backgroundColor: '#FEF3F2',
          padding: '3px 4px',
          color: '#D92D20'
        }}
        hidden={parentLabel !== 'undefined'}
      >
        <span>无效变量</span>
      </span>
    </>
  );
}
