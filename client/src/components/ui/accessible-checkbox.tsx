import * as React from "react";
import { CheckCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type AccessibleCheckboxVariant = "primary" | "amber";

const variantClasses: Record<
  AccessibleCheckboxVariant,
  { checked: string; unchecked: string }
> = {
  primary: {
    checked: "bg-primary border-primary",
    unchecked:
      "border-white/60 bg-white/10 group-hover:border-primary/70",
  },
  amber: {
    checked: "bg-amber-500 border-amber-500",
    unchecked:
      "border-amber-400/70 bg-amber-500/10 group-hover:border-amber-400",
  },
};

export interface AccessibleCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  ariaLabel: string;
  variant?: AccessibleCheckboxVariant;
  boxTestId?: string;
  labelTestId?: string;
  className?: string;
  labelClassName?: string;
}

export function AccessibleCheckbox({
  checked,
  onCheckedChange,
  label,
  ariaLabel,
  variant = "primary",
  boxTestId,
  labelTestId,
  className,
  labelClassName,
}: AccessibleCheckboxProps) {
  const styles = variantClasses[variant];

  const toggle = () => onCheckedChange(!checked);

  return (
    <label
      className={cn(
        "flex items-start gap-3 cursor-pointer group",
        className,
      )}
      data-testid={labelTestId}
    >
      <div
        role="checkbox"
        aria-checked={checked}
        aria-label={ariaLabel}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            toggle();
          }
        }}
        className={cn(
          "mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all",
          checked ? styles.checked : styles.unchecked,
        )}
        data-testid={boxTestId}
      >
        {checked && (
          <CheckCircle
            className="w-3 h-3 text-background"
            strokeWidth={3}
          />
        )}
      </div>
      <span
        className={cn(
          "text-[12px] text-muted-foreground leading-relaxed font-medium",
          labelClassName,
        )}
      >
        {label}
      </span>
    </label>
  );
}
