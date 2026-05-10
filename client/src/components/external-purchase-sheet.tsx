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
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink } from "lucide-react";

export type ExternalPurchaseProduct =
  | "studio_credits"
  | "studio_subscription"
  | "day1og"
  | "trust_box"
  | "business_scout"
  | "business_unlock";

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

  const fetchUrl = async (): Promise<string> => {
    const res = await apiRequest("POST", "/api/mobile/checkout-link", {
      product,
      options: options ?? {},
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
    try {
      const url = await fetchUrl();
      if (isIOS) {
        setPendingUrl(url);
        setOpen(true);
      } else {
        window.location.href = url;
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!pendingUrl) return;
    setOpen(false);
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

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Continue to external website
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed mt-2">
              This link will take you to an external website. Apple is not responsible for the privacy or security of purchases made on the web.
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
