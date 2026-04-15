import { BizLayout } from "@/components/biz-layout";
import { XCircle } from "lucide-react";
import { Link } from "wouter";

const GOLD = "#C6A85C";
const GOLD_BORDER = "rgba(198,168,92,0.22)";
const GOLD_GLOW = "rgba(168,138,67,0.18)";
const CARD_BG = "#0A0A0A";
const MUTED = "#6B6B6B";

export default function BizSponsorDropCancel() {
  return (
    <BizLayout>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "40px 0", textAlign: "center" }}>
        <div style={{
          background: CARD_BG,
          border: `1px solid ${GOLD_BORDER}`,
          borderRadius: "20px",
          padding: "48px 32px",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(168,138,67,0.08)",
            border: `2px solid ${GOLD_BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <XCircle style={{ width: 32, height: 32, color: MUTED }} />
          </div>
          <p style={{ color: MUTED, fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
            Payment Cancelled
          </p>
          <h2 style={{ color: "#F4F4F5", fontSize: "22px", fontWeight: 900, marginBottom: 12, lineHeight: 1.2 }} data-testid="text-cancel-title">
            Your payment was cancelled.
          </h2>
          <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.6, marginBottom: 28 }} data-testid="text-cancel-message">
            No charges were made. You can return to the sponsor form and try again whenever you're ready.
          </p>
          <Link href="/biz/sponsor-drop">
            <a
              style={{
                display: "inline-block",
                background: `linear-gradient(135deg, ${GOLD}, #A88A43, ${GOLD})`,
                border: `1px solid ${GOLD_BORDER}`,
                borderRadius: "14px",
                color: "#000000",
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.15em",
                padding: "14px 32px",
                textDecoration: "none",
                boxShadow: `0 4px 20px ${GOLD_GLOW}`,
              }}
              data-testid="button-return-to-form"
            >
              RETURN TO FORM
            </a>
          </Link>
        </div>
      </div>
    </BizLayout>
  );
}
