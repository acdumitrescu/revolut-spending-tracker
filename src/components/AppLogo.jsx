export default function AppLogo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 2.6 27 7v8.3c0 6.55-3.85 12.42-9.84 14.83L16 30.6l-1.16-.47C8.85 27.72 5 21.85 5 15.3V7l11-4.4Z"
        fill="currentColor"
      />
      <path
        d="M16 6.25 23.35 9.2v5.92c0 4.43-2.45 8.5-6.25 10.43L16 26.1l-1.1-.55c-3.8-1.93-6.25-6-6.25-10.43V9.2L16 6.25Z"
        fill="#071827"
      />
      <path
        d="M20.65 11.2h-6.7a2.35 2.35 0 0 0 0 4.7h4.1a2.35 2.35 0 1 1 0 4.7h-6.7"
        stroke="#F4F8FB"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path d="M16 9.35v2M16 20.6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
