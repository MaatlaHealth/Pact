import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { PHOTOS } from "@/lib/marketing/photos";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Logo priority />
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:px-8 sm:pt-10">
          <div className="w-full max-w-md">{children}</div>
        </main>
        <footer className="px-5 py-5 text-xs text-faint sm:px-8">
          <Link href="/" className="hover:text-ink">
            Back to pactprotocol
          </Link>
          <span className="mx-2">·</span>
          <Link href="/trust" className="hover:text-ink">
            Trust and verification
          </Link>
        </footer>
      </div>
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden>
        <Image src={PHOTOS.facade.src} alt="" width={PHOTOS.facade.width} height={PHOTOS.facade.height} sizes="50vw" className="absolute inset-0 h-full w-full object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b2a5b]/90 via-[#0b2a5b]/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4de3d3]">Why PACT</p>
          <p className="mt-3 max-w-md text-2xl font-medium leading-snug tracking-[-0.02em]">Agents can negotiate and do the work. Only evidence and policy can release the payment.</p>
          <ul className="mt-5 space-y-1.5 text-sm text-white/80">
            <li>PayPal authorization held up front, captured once after verification</li>
            <li>Independent checks in a real browser, evidence stored append-only</li>
            <li>Signed receipts anyone can verify</li>
          </ul>
          <p className="mt-6 text-[10px] uppercase tracking-wider text-white/50">Photo {PHOTOS.facade.credit} on Unsplash</p>
        </div>
      </aside>
    </div>
  );
}
