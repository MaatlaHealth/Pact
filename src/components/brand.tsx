import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Official PACT Protocol logo, rendered from the supplied artwork. */
export function Logo({ className, height = 34, href = "/", priority }: { className?: string; height?: number; href?: string | null; priority?: boolean }) {
  const width = Math.round(height * 2.96);
  const img = <Image src="/brand/pact-logo-tight.png" alt="PACT Protocol" width={width} height={height} priority={priority} className={cn("object-contain", className)} style={{ height, width }} />;
  if (!href) return img;
  return (
    <Link href={href} aria-label="PACT Protocol home" className="inline-flex items-center">
      {img}
    </Link>
  );
}

export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return <Image src="/brand/pact-mark.png" alt="" aria-hidden width={size} height={size} className={cn("object-contain", className)} style={{ width: size, height: size }} />;
}
