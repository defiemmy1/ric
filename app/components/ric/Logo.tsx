export function RicLogo({ size = 28, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Ric">
        <text x="12" y="50" fontFamily="Georgia,serif" fontWeight="700" fontSize="46" fill="#14213d">R</text>
        <circle cx="50" cy="45" r="6" fill="#f26b21" />
      </svg>
      {word && <span className="text-xl font-bold tracking-tight text-[#14213d]">Ric</span>}
    </span>
  );
}
