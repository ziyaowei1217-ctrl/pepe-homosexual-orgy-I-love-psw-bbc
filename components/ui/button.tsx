import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-semibold transition-[background-color,color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/76",
        outline: "border border-input bg-card text-foreground hover:border-foreground/20 hover:bg-muted/55",
        ghost: "text-foreground hover:bg-muted/70",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        trust: "bg-accent text-accent-foreground hover:bg-trust-blue",
        reject: "border border-trust-red/25 bg-card text-trust-red hover:bg-trust-red hover:text-white",
        accept: "border border-trust-green/25 bg-card text-trust-green hover:bg-trust-green hover:text-white"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-[10px] px-3 text-xs",
        lg: "h-11 px-5",
        icon: "size-10",
        iconLg: "size-12"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
