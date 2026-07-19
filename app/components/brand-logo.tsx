import Image from "next/image";
import Link from "next/link";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand-logo${compact ? " compact" : ""}`} href="/" aria-label="ProperAp home">
      <Image
        src="/properap-logo.png"
        alt="ProperAp"
        width={1187}
        height={1015}
        priority
        sizes={compact ? "72px" : "170px"}
      />
    </Link>
  );
}
