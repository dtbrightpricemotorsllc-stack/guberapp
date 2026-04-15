import { BizLayout } from "@/components/biz-layout";
import { CheckCircle } from "lucide-react";
import { Link } from "wouter";

const GOLD = "#C6A85C";
const GOLD_BORDER = "rgba(198,168,92,0.22)";
const GOLD_GLOW = "rgba(168,138,67,0.18)";
const CARD_BG = "#0A0A0A";
const MUTED = "#6B6B6B";

export default function BizSponsorDropSuccess() {
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
            background: GOLD_GLOW,
            border: `2px solid ${GOLD_BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <CheckCircle style={{ width: 32, height: 32, color: GOLD }} />
          </div>
          <p style={{ color: GOLD, fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
            Payment Received
          </p>
          <h2 style={{ color: "#F4F4F5", fontSize: "22px", fontWeight: 900, marginBottom: 12, lineHeight: 1.2 }} data-testid="text-success-title">
            Your drop sponsorship has been received.
          </h2>
          <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.6, marginBottom: 28 }} data-testid="text-success-message">
            GUBER will review and activate your drop. Our team will reach out within 2–3 business days to confirm details and logistics.
          </p>
          <div style={{
            background: "rgba(168,138,67,0.06)",
            border: `1px solid ${GOLD_BORDER}`,
            borderRadius: "12px",
            padding: "16px",
            textAlign: "left",
            marginBottom: 24,
          }}>
            <p style={{ color: GOLD, fontSize: "11px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>
              What happens next
            </p>
            {[
              "Admin reviews your request (1–2 business days)",
              "We contact you to confirm date, location & logistics",
              "Drop is created — your brand appears on the live event",
              "GUBER users race to your location",
              "You get foot traffic + a post-event report",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ color: GOLD, fontSize: "11px", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                <p style={{ color: "#A1A1AA", fontSize: "12px", lineHeight: 1.5 }}>{step}</p>
              </div>
            ))}
          </div>
          <Link href="/biz/sponsor-drop">
            <a style={{ color: GOLD, fontSize: "13px", fontWeight: 600, textDecoration: "none" }} data-testid="link-submit-another">
              Submit another request →
            </a>
          </Link>
        </div>
      </div>
    </BizLayout>
  );
}
