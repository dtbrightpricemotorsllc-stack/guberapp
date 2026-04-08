import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BizLayout } from "@/components/biz-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Send, Clock, CheckCircle2, XCircle, Eye, Search, ArrowRight } from "lucide-react";

const GOLD = "#C6A85C";
const GOLD_DK = "#A88A43";
const GOLD_BORDER = "rgba(198,168,92,0.22)";
const GOLD_GLOW = "rgba(168,138,67,0.18)";
const SURFACE = "#0A0A0A";
const BORDER = "rgba(255,255,255,0.06)";
const TEXT_MUTED = "#6B6B6B";
const TEXT_SEC = "#A1A1A1";
const SUCCESS = "#22C55E";

function statusInfo(status: string) {
  switch (status) {
    case "sent": return { label: "Sent", color: "#60A5FA", icon: Send };
    case "viewed": return { label: "Viewed", color: "#F59E0B", icon: Eye };
    case "accepted": return { label: "Accepted", color: SUCCESS, icon: CheckCircle2 };
    case "declined": return { label: "Declined", color: "#EF4444", icon: XCircle };
    default: return { label: status, color: TEXT_MUTED, icon: Clock };
  }
}

export default function BizOffers() {
  const { data: offers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/business/offers"],
  });

  return (
    <BizLayout>
      <div className="max-w-4xl mx-auto" data-testid="page-biz-offers">
        <div className="mb-8">
          <h1 className="text-xl font-black tracking-tight text-white mb-1">Outreach</h1>
          <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
            Track offers and outreach sent to candidates through the Talent Explorer
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" style={{ background: SURFACE }} />)}
          </div>
        ) : !offers?.length ? (
          <div className="rounded-2xl p-16 text-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}>
              <Send className="w-7 h-7" style={{ color: "#3F3F46" }} />
            </div>
            <p className="text-sm font-bold text-white mb-2">No outreach yet</p>
            <p className="text-xs leading-relaxed max-w-sm mx-auto mb-6" style={{ color: TEXT_MUTED }}>
              Use the Talent Explorer to identify and contact proven workers directly through the GUBER Business network.
            </p>
            <Link href="/biz/talent-explorer">
              <Button
                size="sm"
                className="gap-1.5 h-9 text-[10px] font-bold tracking-[0.12em] rounded-xl"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: "#000", border: `1px solid ${GOLD_BORDER}`, boxShadow: `0 2px 12px ${GOLD_GLOW}` }}
                data-testid="button-explore-talent"
              >
                <Search className="w-3 h-3" />
                OPEN TALENT EXPLORER
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map((offer: any) => {
              const info = statusInfo(offer.status);
              const Icon = info.icon;
              return (
                <div key={offer.id} className="rounded-2xl p-4 flex items-center gap-4 transition-all hover:border-white/[0.10] hover:bg-white/[0.01]" style={{ background: SURFACE, border: `1px solid ${BORDER}` }} data-testid={`offer-${offer.id}`}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${info.color}10`, border: `1px solid ${info.color}18` }}>
                    <Icon className="w-4 h-4" style={{ color: info.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{offer.subject}</p>
                    <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                      {offer.offerType?.replace(/_/g, " ")} · Candidate #{offer.userId}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[9px] px-2.5 py-1 rounded-full font-bold tracking-[0.12em] uppercase"
                      style={{ background: `${info.color}10`, color: info.color, border: `1px solid ${info.color}18` }}>
                      {info.label}
                    </span>
                    <p className="text-[10px] mt-1.5" style={{ color: "#3F3F46" }}>
                      {offer.sentAt ? new Date(offer.sentAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BizLayout>
  );
}
