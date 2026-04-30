import React, { useId } from 'react';

type AgentLinearProps = React.SVGProps<SVGSVGElement>;

const AgentLinear: React.FC<AgentLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M36 11.57L34.32 8L32.64 11.57L29.07 13.25L32.64 14.93L34.32 18.5L36 14.93L39.57 13.25L36 11.57Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M25.8 20.48C25.86 20.61 25.96 20.71 26.09 20.77L31.04 23.09L33.41 24.21C33.62 24.31 33.76 24.52 33.76 24.75C33.76 24.98 33.62 25.19 33.41 25.29L31.04 26.41L26.09 28.73C25.96 28.79 25.86 28.89 25.8 29.02L23.47 33.97L21.18 36.69C21.07 36.9 20.86 37.01 20.65 37.01C20.44 37.01 20.23 36.9 20.12 36.69L17.83 33.97L15.5 29.02C15.44 28.89 15.34 28.79 15.21 28.73L10.26 26.41L7.89 25.29C7.68 25.19 7.54 24.98 7.54 24.75C7.54 24.52 7.68 24.31 7.89 24.21L10.26 23.09L15.21 20.77C15.34 20.71 15.44 20.61 15.5 20.48L17.83 15.53L20.12 12.81C20.23 12.6 20.44 12.49 20.65 12.49C20.86 12.49 21.07 12.6 21.18 12.81L23.47 15.53L25.8 20.48Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="22"
          y1="8"
          x2="22"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4ADE80" />
          <stop offset="1" stopColor="#14A846" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default AgentLinear;
