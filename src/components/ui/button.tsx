import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary: "bg-[#0b2a5b] text-white hover:bg-[#133a78] dark:bg-[#2fd4c2] dark:text-[#0a1628] dark:hover:bg-[#4de3d3] shadow-sm",
        accent: "bg-[#0fa99b] text-white hover:bg-[#0d9488] shadow-sm",
        secondary: "border border-border bg-surface text-ink hover:border-border-strong hover:bg-surface-2",
        ghost: "text-ink-2 hover:bg-surface-2",
        danger: "bg-[#b91c1c] text-white hover:bg-[#991b1b]",
        link: "text-navy underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
    {children}
  </button>
));
Button.displayName = "Button";

export { buttonVariants };
