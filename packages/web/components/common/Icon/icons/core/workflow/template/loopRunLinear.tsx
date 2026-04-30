import React, { useId } from 'react';

type LoopRunLinearProps = React.SVGProps<SVGSVGElement>;

const LoopRunLinear: React.FC<LoopRunLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="translate(4 4) scale(2.5)">
        <path
          d="M11.3333 1.33325L14 3.99992M14 3.99992L11.3333 6.66658M14 3.99992H4.66667C3.95942 3.99992 3.28115 4.28087 2.78105 4.78097C2.28095 5.28106 2 5.95934 2 6.66658V7.33325M4.66667 14.6666L2 11.9999M2 11.9999L4.66667 9.33325M2 11.9999H11.3333C12.0406 11.9999 12.7189 11.719 13.219 11.2189C13.719 10.7188 14 10.0405 14 9.33325V8.66658"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="44"
          x2="24"
          y2="4"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6EE7B7" />
          <stop offset="1" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default LoopRunLinear;
