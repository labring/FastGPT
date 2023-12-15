import React from 'react';
import { useStoreApi, type ConnectionLineComponentProps } from 'reactflow';

const CustomConnection = ({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) => {
  const store = useStoreApi();

  const { connectionHandleId } = store.getState();
  console.log(fromX, fromY, toX, toY, connectionHandleId);

  return (
    <g>
      <path
        fill="none"
        stroke={connectionHandleId || ''}
        strokeWidth={1.5}
        d={`M${fromX},${fromY} C ${fromX} ${toY} ${fromX} ${toY} ${toX},${toY}`}
      />
      <circle
        cx={toX}
        cy={toY}
        fill="#fff"
        r={3}
        stroke={connectionHandleId || ''}
        strokeWidth={1.5}
      />
    </g>
  );
};

export default CustomConnection;
