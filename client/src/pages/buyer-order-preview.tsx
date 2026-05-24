import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { MarketplaceItem } from "@shared/schema";

export default function BuyerOrderPreview() {
  const { id } = useParams<{ id: string }>();

  const { data: item, isLoading } = useQuery<MarketplaceItem>({
    queryKey: ["/api/marketplace/item", id],
    queryFn: () => fetch(`/api/marketplace/${id}`).then(r => r.json()),
    enabled: !!id,
  });

  if (isLoading) return (
    <div style={{ fontFamily: "Helvetica, Arial, sans-serif", background: "#e8e8e8", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#666", fontSize: 13 }}>Loading preview…</p>
    </div>
  );

  if (!item || (item as any).message) return (
    <div style={{ fontFamily: "Helvetica, Arial, sans-serif", background: "#e8e8e8", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#c00", fontSize: 13 }}>Listing not found.</p>
    </div>
  );

  const d = (item.details as Record<string, any>) || {};
  const sellerTypeLabel = item.sellerType === "dealer" ? "Dealer" : "Private Seller";
  const vinDisplay = item.vinNumber || "Not provided";
  const mileage = item.vehicleMileage ? `${item.vehicleMileage.toLocaleString()} miles` : "Not provided";
  const askingLabel = item.askingType === "obo" ? " (OBO)" : item.askingType === "firm" ? " (Firm)" : "";
  const priceDisplay = item.askingType === "free" ? "Free" : item.price ? `$${item.price.toLocaleString()}${askingLabel}` : "Contact for price";
  const listingTypeMap: Record<string, string> = {
    cash_sale: "Cash Sale", financing: "Financing Available", bhph: "Buy Here Pay Here",
    lease: "Lease", trade: "Trade / Barter", parts_only: "Parts Only",
    rental: "Rental", for_rent: "For Rent", owner_financing: "Owner Financing",
  };
  const listingTypeLabel = listingTypeMap[item.listingType || ""] || "Cash Sale";
  const conditionFlags: string[] = Array.isArray(d.conditionFlags) ? d.conditionFlags : [];
  const rawNotes = d.sellerDisclosures || d.conditionNotes || item.description || "None provided.";
  const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const isProperty = ["property", "real estate"].includes((item.category || "").toLowerCase());
  const isVehicle  = ["vehicles", "boats & marine", "trailers", "parts"].includes((item.category || "").toLowerCase());
  const identifierLabel = isProperty ? "APN / Parcel ID" : isVehicle ? "VIN" : "Identifier";
  const identifierValue2 = item.vinNumber || d.apn || d.parcelId || "Not provided";
  const assetSectionLabel = isProperty ? "PROPERTY INFORMATION" : isVehicle ? "VEHICLE INFORMATION" : "ASSET INFORMATION";

  const s: Record<string, React.CSSProperties> = {
    body: { fontFamily: "Helvetica, Arial, sans-serif", background: "#d8d8d8", padding: "32px 16px", paddingBottom: "calc(68px + env(safe-area-inset-bottom, 20px) + 32px)", minHeight: "100vh" },
    banner: { background: "#1a1a1a", color: "#00e676", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", padding: "9px", marginBottom: 20, borderRadius: 4 },
    page: { background: "#fff", width: "100%", maxWidth: 760, margin: "0 auto", padding: "48px 52px 64px", boxShadow: "0 4px 32px rgba(0,0,0,0.18)", position: "relative" },
    title: { fontSize: 17, fontWeight: 700, letterSpacing: "0.01em", color: "#111" },
    sub: { fontSize: 10, color: "#888", marginTop: 4 },
    topRight: { position: "absolute", top: 48, right: 52, textAlign: "right", fontSize: 8, color: "#666", lineHeight: 1.8 },
    rule: { border: "none", borderTop: "1.5px solid #1a1a1a", margin: "12px 0 0" },
    ruleThin: { border: "none", borderTop: "0.5px solid #ccc", margin: "8px 0" },
    sellerBlock: { margin: "14px 0 10px" },
    sellerName: { fontSize: 14, fontWeight: 700, color: "#111" },
    sellerMeta: { fontSize: 9, color: "#666", marginTop: 3 },
    disclaimer: { background: "#f4f4f4", padding: "8px 10px", fontSize: 6.5, color: "#666", lineHeight: 1.6, margin: "10px 0 18px" },
    sectionHead: { background: "#f4f4f4", padding: "5px 8px", fontSize: 7, fontWeight: 700, color: "#666", letterSpacing: "0.1em", display: "block" },
    table: { width: "100%", borderCollapse: "collapse" as const, marginBottom: 0 },
    tdLabel: { fontSize: 8.5, padding: "4px 6px", borderBottom: "0.4px solid #ccc", color: "#666", width: 175, verticalAlign: "top" as const, fontWeight: 400 },
    tdVal: { fontSize: 8.5, padding: "4px 6px", borderBottom: "0.4px solid #ccc", color: "#111", fontWeight: 700, verticalAlign: "top" as const },
    tdWarn: { fontSize: 8.5, padding: "4px 6px", borderBottom: "0.4px solid #ccc", color: "#b45309", fontWeight: 700, verticalAlign: "top" as const },
    tdFlag: { fontSize: 8.5, padding: "4px 6px", borderBottom: "0.4px solid #ccc", color: "#b45309", fontWeight: 700, verticalAlign: "top" as const },
    tdGreen: { fontSize: 8.5, padding: "4px 6px", borderBottom: "0.4px solid #ccc", color: "#119900", fontWeight: 800, verticalAlign: "top" as const },
    gap: { height: 16, display: "block" as const },
    talkBox: { display: "flex", gap: 8, margin: "16px 0" },
    talkHalf: { flex: 1, background: "#f4f4f4", padding: "10px 12px", fontSize: 6.8, color: "#555", lineHeight: 1.7 },
    talkTitle: { display: "block", fontSize: 7.5, color: "#1a1a1a", fontWeight: 700, marginBottom: 4 },
    ctaBox: { background: "#050507", padding: "12px 14px", margin: "0 0 16px", borderRadius: 4 },
    footer: { borderTop: "0.5px solid #ccc", paddingTop: 10, marginTop: 24, fontSize: 6, color: "#999", lineHeight: 1.6 },
  };

  const Row = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
    <tr>
      <td style={s.tdLabel}>{label}</td>
      <td style={warn ? s.tdWarn : s.tdVal}>{value || "—"}</td>
    </tr>
  );

  const isTitleWarn = !!(item.titleStatus && item.titleStatus !== "Clean Title – In Hand" && item.titleStatus !== "Clean Title");

  return (
    <div style={s.body}>
      <div style={s.banner}>⬇ TRANSACTION ROADPASS PREVIEW — SAMPLE ONLY · NOT A REAL DOCUMENT</div>
      <div style={s.page}>
        <div style={s.title}>TRANSACTION ROADPASS &amp; VALUATION SHEET</div>
        <div style={s.sub}>Asset Financing Reference &nbsp;·&nbsp; GUBER Marketplace</div>
        <div style={s.topRight}>Date: {generatedDate}<br />Ref #{item.id}</div>
        <hr style={s.rule} />

        <div style={s.sellerBlock}>
          <div style={{ fontSize: 7, color: "#666", letterSpacing: "0.1em", marginBottom: 6 }}>SELLER INFORMATION</div>
          <div style={s.sellerName}>{item.sellerName || "Private Party"}</div>
          <div style={s.sellerMeta}>{sellerTypeLabel}&nbsp;&nbsp;·&nbsp;&nbsp;{item.city || ""}{item.city && item.state ? ", " : ""}{item.state || ""}</div>
        </div>
        <hr style={s.ruleThin} />

        <div style={s.disclaimer}>
          <strong>DISCLAIMER &amp; LIMITATION OF LIABILITY:</strong> This document is generated strictly for informational and convenience purposes to optimize transactional speed. Guber Global LLC is not a licensed financial institution, lender, loan broker, auto dealer, or insurance underwriter. Guber Global LLC does not offer credit approvals, rate guarantees, or financial underwriting services. All final transaction terms, asset valuations, lending approval metrics, and coverage terms are strictly determined by the independent financial entities or risk insurers selected entirely by the user. Guber Global LLC assumes zero legal or financial liability for transaction accuracy, physical asset conditions, title validation discrepancies, or default occurrences.
        </div>

        <span style={s.sectionHead}>{assetSectionLabel}</span>
        <table style={s.table}>
          <tbody>
            {item.year && <Row label="Year" value={String(item.year)} />}
            {item.brand && <Row label="Make / Brand" value={item.brand} />}
            {item.model && <Row label="Model" value={item.model} />}
            {(d.trim || d.vehicleTrim) && <Row label="Trim / Series" value={d.trim || d.vehicleTrim} />}
            {isVehicle && <Row label="Mileage" value={mileage} />}
            <Row label={identifierLabel} value={identifierValue2} />
            {d.engine && <Row label="Engine" value={d.engine} />}
            {d.transmission && <Row label="Transmission" value={d.transmission} />}
            {d.fuelType && <Row label="Fuel Type" value={d.fuelType} />}
            {d.driveType && <Row label="Drive Type" value={d.driveType} />}
            {d.exteriorColor && <Row label="Exterior Color" value={d.exteriorColor} />}
            {d.interiorColor && <Row label="Interior Color" value={d.interiorColor} />}
            {d.sqft && <Row label="Square Footage" value={`${d.sqft} sq ft`} />}
            {d.bedrooms && <Row label="Bedrooms" value={String(d.bedrooms)} />}
            {d.bathrooms && <Row label="Bathrooms" value={String(d.bathrooms)} />}
            {d.propertyType && <Row label="Property Type" value={d.propertyType} />}
          </tbody>
        </table>
        <span style={s.gap} />

        <span style={s.sectionHead}>LISTING INFORMATION</span>
        <table style={s.table}>
          <tbody>
            <Row label="Asking Price" value={priceDisplay} />
            <Row label="Purchase Type" value={listingTypeLabel} />
            <Row label="Seller Name" value={item.sellerName || "—"} />
            <Row label="Seller Type" value={sellerTypeLabel} />
            <Row label="Location" value={`${item.city || ""}${item.city && item.state ? ", " : ""}${item.state || ""}`} />
            {(item as any).zipcode && <Row label="ZIP Code" value={(item as any).zipcode} />}
            <Row label="Listing ID" value={String(item.id)} />
          </tbody>
        </table>
        <span style={s.gap} />

        <span style={s.sectionHead}>FINANCING OVERVIEW</span>
        <table style={s.table}>
          <tbody>
            <Row label="Listing / Asking Price" value={priceDisplay} />
            <Row label="Buyer Down Payment" value="[Enter before generating]" />
            <tr>
              <td style={s.tdLabel}>Net Loan Request</td>
              <td style={s.tdGreen}>[Calculated on full document]</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 6.5, color: "#999", marginTop: 3, marginBottom: 12 }}>* Down payment entered by buyer before generating PDF. Final financing terms determined solely by the lender.</div>

        <span style={s.sectionHead}>CONDITION &amp; TITLE</span>
        <table style={s.table}>
          <tbody>
            <Row label="Title Status" value={item.titleStatus || "—"} warn={isTitleWarn} />
            {item.condition && <Row label="Condition" value={item.condition} />}
            {conditionFlags.length > 0 && (
              <tr>
                <td style={s.tdLabel}>Condition Flags</td>
                <td style={s.tdFlag}>{conditionFlags.join("  ·  ")}</td>
              </tr>
            )}
            <tr>
              <td style={s.tdLabel}>Condition Notes</td>
              <td style={s.tdVal}>{rawNotes.slice(0, 400)}</td>
            </tr>
            {d.dealerFees && (
              <tr>
                <td style={s.tdLabel}>Dealer Fees / Notes</td>
                <td style={s.tdVal}>{d.dealerFees}</td>
              </tr>
            )}
          </tbody>
        </table>
        <span style={s.gap} />

        <div style={s.talkBox}>
          <div style={s.talkHalf}>
            <span style={s.talkTitle}>BANK / CREDIT UNION CALL SCRIPT</span>
            "Hello, I'm calling about a pre-purchase financing inquiry. I have a {isProperty ? "property" : "vehicle"} I'm interested in purchasing. The {identifierLabel} is {identifierValue2}. Asking price is {priceDisplay}. I have a down payment available. Can you start a loan pre-qualification?"
          </div>
          <div style={s.talkHalf}>
            <span style={s.talkTitle}>INSURANCE AGENT CALL SCRIPT</span>
            "Hello, I need an insurance quote on a {isProperty ? "property" : "vehicle"} I'm purchasing. The {identifierLabel} is {identifierValue2}, listed at {priceDisplay} in {item.city || ""}{item.city && item.state ? ", " : ""}{item.state || ""}. Can you give me a quote and let me know what information you need?"
          </div>
        </div>

        <div style={s.ctaBox}>
          <div style={{ color: "#00e676", fontSize: 8.5, fontWeight: 700, marginBottom: 6 }}>VERIFY BEFORE YOU FUND &nbsp;·&nbsp; GUBER Business</div>
          <div style={{ color: "#aeb7c7", fontSize: 7, lineHeight: 1.7 }}>
            Financial companies: Request GPS-verified, time-stamped visual confirmation of vehicles, property, equipment, and other assets before lending, buying, funding, or repossessing. Visual documentation only. GUBER does not certify condition, title, value, or ownership.
          </div>
          <div style={{ color: "#00e676", fontSize: 7, fontWeight: 700, marginTop: 6 }}>guberapp.app/biz &nbsp;·&nbsp; Request Verify &amp; Inspect</div>
        </div>

        <div style={s.footer}>
          Generated via GUBER Marketplace · guberapp.app · Guber Global LLC is not a licensed financial institution, lender, loan broker, auto dealer, or insurance underwriter. GUBER provides visual documentation and marketplace services only. GUBER assumes zero legal or financial liability for transaction accuracy, physical asset conditions, title validation discrepancies, or default occurrences.
        </div>
      </div>
    </div>
  );
}
