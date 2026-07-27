import Image from 'next/image';

type BrandMarkProps = {
  size?: number;
  className?: string;
  /** Use light mark for permanently dark backgrounds */
  onDark?: boolean;
};

export function BrandMark({ size = 40, className = '', onDark = false }: BrandMarkProps) {
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: Math.round(size * 1.43) }}
    >
      {onDark ? (
        <Image
          src="/brand/logo-mark-metallic.svg"
          alt="Arachnix"
          fill
          className="object-contain"
          priority
          sizes={`${size}px`}
        />
      ) : (
        <>
          <Image
            src="/brand/logo-mark.svg"
            alt="Arachnix"
            fill
            className="object-contain dark:hidden"
            priority
            sizes={`${size}px`}
          />
          <Image
            src="/brand/logo-mark-metallic.svg"
            alt=""
            fill
            aria-hidden
            className="hidden object-contain dark:block"
            priority
            sizes={`${size}px`}
          />
        </>
      )}
    </span>
  );
}

type BrandWordmarkProps = {
  className?: string;
  onDark?: boolean;
};

export function BrandWordmark({ className = '', onDark = false }: BrandWordmarkProps) {
  return (
    <span className={`relative block h-7 w-[148px] ${className}`}>
      <Image
        src="/brand/wordmark.svg"
        alt="Arachnix"
        fill
        className={`object-contain object-left ${
          onDark ? 'brightness-0 invert' : 'dark:brightness-0 dark:invert'
        }`}
        priority
        sizes="148px"
      />
    </span>
  );
}
