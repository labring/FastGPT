import React, { useId } from 'react';

type DatasetConcatLinearLinearProps = React.SVGProps<SVGSVGElement>;

const DatasetConcatLinearLinear: React.FC<DatasetConcatLinearLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M36.0507 14.2098L44 22.6096M44 22.6096L36.0507 31.0094M44 22.6096L28.1029 22.6112L17.2489 38H4M4.00004 10H17.2489L22.5485 18.3998"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="14.0905"
          y1="0.0953063"
          x2="14.0905"
          y2="18.4001"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#68C0FF" />
          <stop offset="1" stopColor="#53A3FF" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default DatasetConcatLinearLinear;
