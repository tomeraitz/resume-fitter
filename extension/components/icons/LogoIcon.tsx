interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 24, className = '' }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="6" fill="var(--rf-accent-400)" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontFamily="'DM Sans', system-ui, sans-serif"
        fontWeight="700"
        fontSize="11"
        fill="white"
      >
        CV
      </text>
    </svg>
  );
}
