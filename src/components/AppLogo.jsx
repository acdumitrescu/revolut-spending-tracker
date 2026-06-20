export default function AppLogo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.3 19.1 5.2v5.26c0 4.47-2.59 8.52-6.61 10.33L12 21l-.49-.21c-4.02-1.81-6.61-5.86-6.61-10.33V5.2L12 2.3Z"
        fill="currentColor"
      />
      <path
        d="M12 5.15 16.58 7v3.39c0 3.03-1.71 5.8-4.58 7.25-2.87-1.45-4.58-4.22-4.58-7.25V7L12 5.15Z"
        fill="white"
      />
      <path
        d="M12 7.25 14.72 8.34v2.1c0 1.87-1.03 3.6-2.72 4.61-1.69-1.01-2.72-2.74-2.72-4.61v-2.1L12 7.25Z"
        fill="currentColor"
        opacity="0.2"
      />
    </svg>
  );
}
