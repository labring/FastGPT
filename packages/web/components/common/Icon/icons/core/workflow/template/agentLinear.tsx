import React, { useId } from 'react';

type AgentLinearProps = React.SVGProps<SVGSVGElement>;

const AgentLinear: React.FC<AgentLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M9.87421 3.51983C10.5457 1.55476 13.2609 1.49525 14.057 3.34129L14.1244 3.52095L15.0306 6.17098C15.2382 6.77873 15.5738 7.33487 16.0147 7.8019C16.4556 8.26892 16.9915 8.63597 17.5863 8.87828L17.83 8.96923L20.48 9.87429C22.4451 10.5458 22.5046 13.2609 20.6597 14.0571L20.48 14.1244L17.83 15.0306C17.222 15.2381 16.6656 15.5737 16.1984 16.0146C15.7312 16.4554 15.364 16.9914 15.1215 17.5863L15.0306 17.8289L14.1255 20.48C13.454 22.4451 10.7388 22.5046 9.94383 20.6597L9.87421 20.48L8.96915 17.83C8.76161 17.222 8.42608 16.6657 7.9852 16.1984C7.54431 15.7312 7.00833 15.364 6.41343 15.1216L6.17088 15.0306L3.52083 14.1256C1.55463 13.4541 1.49512 10.7389 3.34117 9.9439L3.52083 9.87429L6.17088 8.96923C6.77863 8.76156 7.33478 8.42597 7.80181 7.98509C8.26884 7.54422 8.63589 7.00831 8.87819 6.41352L8.96915 6.17098L9.87421 3.51983Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="16.7368"
          y1="0.947368"
          x2="7.26316"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5CE5F8" />
          <stop offset="0.659015" stopColor="#53E7CE" />
          <stop offset="1" stopColor="#8052F5" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default AgentLinear;
