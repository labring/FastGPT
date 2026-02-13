import React, { useId } from 'react';

type ToolParamsLinearLinearProps = React.SVGProps<SVGSVGElement>;

const ToolParamsLinearLinear: React.FC<ToolParamsLinearLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M42 8H28M20 8H6M42 24H24M16 24H6M42 40H32M24 40H6M28 4V12M16 20V28M32 36V44"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="4"
          x2="24"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#91A8FE" />
          <stop offset="1" stopColor="#B786FE" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default ToolParamsLinearLinear;
