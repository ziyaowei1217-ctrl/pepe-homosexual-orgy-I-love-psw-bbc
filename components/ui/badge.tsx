import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-accent-foreground",
        secondary: "border-transparent bg-blue-50 text-blue-700",
        outline: "border-blue-200 bg-white text-foreground",
        trust: "border-trust-sky/20 bg-trust-sky/10 text-trust-blue",
        success: "border-trust-green/20 bg-trust-green/10 text-trust-green",
        warning: "border-trust-amber/25 bg-trust-amber/10 text-trust-amber",
        danger: "border-trust-red/20 bg-trust-red/10 text-trust-red"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
