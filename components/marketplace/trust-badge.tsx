import { ShieldCheck, ShieldEllipsis } from "lucide-react";

import { reviewLabel, type ListingTrust } from "@/lib/listing-trust";
import { cn } from "@/lib/utils";

/** psw TrustBadge: the platform review state, the same words wherever a listing's trust is shown. */
export function TrustBadge({ trust, className }: { trust: ListingTrust; className?: string }) {
  const Icon = trust.reviewed ? ShieldCheck : ShieldEllipsis;
  return <span className={cn("inline-flex items-center gap-1 rounded-psw-sm px-2.5 py-1 text-m-footnote font-bold", trust.reviewed ? "bg-success-soft text-success-text" : "bg-tag-neutral text-ink-secondary", className)}>
    <Icon className="size-3.5" aria-hidden="true" />{reviewLabel(trust)}
  </span>;
}
