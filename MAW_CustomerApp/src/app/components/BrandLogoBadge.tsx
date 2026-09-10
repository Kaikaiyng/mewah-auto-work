import logo from 'figma:asset/9579c9865ae700123383ca50bc26e6829232a00d.png';

export const brandLogoSrc = logo;

type BrandLogoBadgeProps = {
  compact?: boolean;
  plain?: boolean;
  className?: string;
};

export function BrandLogoBadge({ compact = false, plain = false, className = '' }: BrandLogoBadgeProps) {
  const containerClassName = plain
    ? 'p-0'
    : compact
      ? 'rounded-xl border border-white/80 bg-gradient-to-br from-white to-blue-50/95 px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.16)] backdrop-blur-sm'
      : 'rounded-2xl border border-white/80 bg-gradient-to-br from-white to-blue-50/95 px-5 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.16)] backdrop-blur-sm';

  return (
    <div className={`inline-flex items-center justify-center ${containerClassName} ${className}`}>
      <img
        src={logo}
        alt="Mewah AutoWorks"
        className={plain ? (compact ? 'h-12 w-auto' : 'h-16 w-auto') : compact ? 'h-10 w-auto' : 'h-14 w-auto'}
      />
    </div>
  );
}
