import Image from "next/image";
import Link from "next/link";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand-logo${compact ? " compact" : ""}`} href="/" aria-label="SteadFast Realty home">
      <Image
        src={compact ? "/steadfast-brand-mark-on-dark.png" : "/steadfast-brand-logo-on-dark.png"}
        alt="SteadFast Realty"
        width={compact ? 548 : 936}
        height={compact ? 304 : 595}
        priority
        sizes={compact ? "90px" : "198px"}
      />
    </Link>
  );
}
