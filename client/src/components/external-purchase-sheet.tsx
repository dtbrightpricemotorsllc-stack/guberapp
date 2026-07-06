import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { isIOS } from "@/lib/platform";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { reportIssue } from "@/lib/report-issue";
import { ExternalLink } from "lucide-react";

export type ExternalPurchaseProduct =
  | "studio_credits"
  | "studio_subscription"
  | "day1og"
  | "trust_box"
  | "business_scout"
  | "business_unlock"
  | "marketplace_buyer_order"
  | "asset_protection"
  | "asset_protection_founders";

interface ExternalPurchaseSheetProps {
  product: ExternalPurchaseProduct;
  options?: Record<string, string>;
  children: (props: { onPress: () => void; loading: boolean }) => React.ReactNode;
}

export function ExternalPurchaseSheet({
  product,
  options,
  children,
}: ExternalPurchaseSheetProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUrl = async (): Promise<string> => {
    const res = await apiRequest("POST", "/api/mobile/checkout-link", {
      product,
      // On iOS native builds, ask the server to use a guber:// deep-link as
      // the Stripe success_url. That way Stripe redirects straight into the
      // app and NativeDeepLinkHandler fires queryClient.invalidateQueries
      // immediately rather than waiting for the user to tap a banner.
      options: {
        ...(options ?? {}),
        ...(isIOS ? {
          successUrl: (() => {
            const params = new URLSearchParams();
            if (product === "studio_subscription") {
              params.set("type", "subscription");
              if (options?.tier) params.set("tier", options.tier);
            } else if (product === "studio_credits") {
              params.set("type", "credits");
            } else if (product === "day1og") {
              params.set("type", "day1og");
            } else if (product === "trust_box") {
              params.set("type", "trust_box");
            } else if (product === "business_scout") {
              params.set("type", "business_scout");
            } else if (product === "business_unlock") {
              params.set("type", "business_unlock");
            } else if (product === "asset_protection") {
              params.set("type", "asset_protection");
            } else if (product === "asset_protection_founders") {
              params.set("type", "asset_protection_founders");
            }
            const qs = params.toString();
            return `guber://purchase-complete${qs ? "?" + qs : ""}`;
          })(),
        } : {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to create checkout link" }));
      throw new Error(err.message || "Failed to create checkout link");
    }
    const data = await res.json();
    if (!data.url) throw new Error("No checkout URL returned");
    return data.url;
  };

  const handlePress = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = await fetchUrl();
      if (isIOS) {
        setPendingUrl(url);
        setOpen(true);
      } else {
        window.location.href = url;
      }
    } catch (err: any) {
      setError(err?.message || "Unable to open checkout. Please try again.");
      reportIssue({ module: "payment", attemptedAction: `checkout:${product}`, error: err, blocked: true, relatedIds: { product } });
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!pendingUrl) return;
    setOpen(false);

    // Fallback: if the user closes the SFSafariViewController without tapping
    // the "Return to GUBER app" deep-link (e.g. swipe-dismiss after payment),
    // wait 3 s for the Stripe webhook to land then refresh the user record.
    // The fast path is the guber://purchase-complete deep-link handled in
    // NativeDeepLinkHandler (App.tsx) which fires invalidation instantly.
    let browserListener: { remove: () => void } | null = null;
    Browser.addListener("browserFinished", () => {
      if (browserListener) { browserListener.remove(); browserListener = null; }
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }, 3000);
    }).then((h) => { browserListener = h; });

    await Browser.open({ url: pendingUrl, presentationStyle: "popover" });
    setPendingUrl(null);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setPendingUrl(null);
    setOpen(v);
  };

  return (
    <>
      {children({ onPress: handlePress, loading })}
      {error && (
        <p className="text-[11px] text-destructive mt-1.5 text-center" data-testid="text-purchase-error">
          {error}
        </p>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Continue to external website
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed mt-2">
              This purchase is available to U.S. customers only. You'll be taken to an external website to complete checkout. Apple is not responsible for the privacy or security of purchases made on the web.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setOpen(false); setPendingUrl(null); }}
              data-testid="button-disclosure-cancel"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleContinue}
              data-testid="button-disclosure-continue"
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
