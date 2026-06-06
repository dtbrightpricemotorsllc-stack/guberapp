// ════════════════════════════════════════════════════════════════════════════
// GUBER Verified Release System™ — Transport Passport PDF renderer.
// Streams a tamper-evident summary of an asset's full chain of custody using
// pdfkit. Pure formatting — all data comes from the server-authoritative
// passport aggregation (server/asset-custody.ts: getTransportPassport).
// ════════════════════════════════════════════════════════════════════════════
import PDFDocument from "pdfkit";
import type { Writable } from "stream";
import type { TransportPassport } from "./asset-custody";

const INK = "#0f172a";
const MUTED = "#64748b";
const ACCENT = "#1d4ed8";
const DANGER = "#b91c1c";
const LINE = "#e2e8f0";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render the passport into the response stream. Resolves when fully written. */
export function renderTransportPassportPdf(p: TransportPassport, out: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50, bufferPages: true });
    doc.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => resolve());
    doc.pipe(out);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;

    const hr = () => {
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(LINE).lineWidth(1).stroke();
      doc.moveDown(0.6);
    };

    const sectionTitle = (t: string) => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(0.4);
      doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(12).text(t.toUpperCase());
      doc.moveDown(0.2);
      hr();
    };

    const row = (label: string, value: string) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const y = doc.y;
      doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(label, left, y, { width: 150 });
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(value || "—", left + 160, y, { width: contentWidth - 160 });
      doc.moveDown(0.35);
    };

    const bullet = (text: string, color = INK) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      doc.fillColor(color).font("Helvetica").fontSize(9).text(`•  ${text}`, left + 6, doc.y, { width: contentWidth - 6 });
      doc.moveDown(0.2);
    };

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text("GUBER Transport Passport");
    doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("Verified Release System™ — tamper-evident chain of custody");
    doc.moveDown(0.3);
    doc.fillColor(MUTED).fontSize(8).text(`Generated ${fmtDate(new Date())}  ·  Asset #${p.asset.id}  ·  Status: ${titleCase(p.asset.status || "pending")}`);
    doc.moveDown(0.6);
    hr();

    // ── Asset ───────────────────────────────────────────────────────────────
    sectionTitle("Asset");
    const a = p.asset;
    const name = [a.year, a.make, a.model].filter(Boolean).join(" ") || a.description || titleCase(a.assetType || "asset");
    row("Asset", name);
    row("Type", titleCase(a.assetType || "vehicle"));
    if (a.vin) row("VIN / identifier", a.vin);
    if (a.estimatedValue != null) row("Estimated value", `$${Number(a.estimatedValue).toLocaleString()}`);
    if (a.packageTier) row("Protection package", titleCase(a.packageTier));
    row("Witness add-on", a.witnessAddon ? "Yes" : "No");
    if (a.frozenAt) row("FROZEN", `${fmtDate(a.frozenAt)} — ${a.frozenReason || "no reason given"}`);

    // ── Parties ─────────────────────────────────────────────────────────────
    sectionTitle("Parties & Roles");
    if (!p.roles.length) bullet("No roles assigned.", MUTED);
    for (const r of p.roles.filter((r) => r.status === "active")) {
      bullet(`${titleCase(r.role)} — user #${r.userId}`);
    }

    // ── Fraud flags ─────────────────────────────────────────────────────────
    sectionTitle("Fraud-Risk Flags");
    if (!p.fraudFlags.length) bullet("No fraud-risk flags detected.", MUTED);
    for (const f of p.fraudFlags) bullet(`${f.label} (${f.severity})`, f.severity === "critical" ? DANGER : INK);

    // ── Verifications ───────────────────────────────────────────────────────
    sectionTitle("VIN Verification");
    if (!p.vinVerifications.length) bullet("No VIN verifications on file.", MUTED);
    for (const v of p.vinVerifications) {
      bullet(`${titleCase(v.status || "pending")} — expected ${v.expectedVin || "—"} / scanned ${v.scannedVin || "—"} (${fmtDate(v.createdAt)})`, v.status === "mismatch" ? DANGER : INK);
    }

    sectionTitle("Tow Vehicle Verification");
    if (!p.towVerifications.length) bullet("No tow vehicle verifications on file.", MUTED);
    for (const t of p.towVerifications) {
      bullet(`${titleCase(t.vehicleType || "tow vehicle")} — plate ${t.plateNumber || "—"} ${t.plateState || ""} ${t.verified ? "✓ verified" : "(unverified)"} (${fmtDate(t.createdAt)})`);
    }

    sectionTitle("Trailer Verification");
    if (!p.trailerVerifications.length) bullet("No trailer verifications on file.", MUTED);
    for (const t of p.trailerVerifications) {
      bullet(`${titleCase(t.trailerType || "trailer")} — unit ${t.trailerNumber || "—"} plate ${t.plateNumber || "—"} ${t.verified ? "✓ verified" : "(unverified)"} (${fmtDate(t.createdAt)})`);
    }

    // ── Release authorizations ──────────────────────────────────────────────
    sectionTitle("Release Authorizations");
    if (!p.releaseAuthorizations.length) bullet("No release authorizations on file.", MUTED);
    for (const r of p.releaseAuthorizations) {
      bullet(`${titleCase(r.status || "pending")} — requested by #${r.requestedBy}, geofence ${r.geofenceVerified ? "verified" : "FAILED"}${r.geofenceMeters != null ? ` (${r.geofenceMeters}m)` : ""} (${fmtDate(r.createdAt)})`, r.status === "denied" ? DANGER : INK);
    }

    // ── Issues & incidents ──────────────────────────────────────────────────
    sectionTitle("Transport Issues");
    if (!p.issues.length) bullet("No issues reported.", MUTED);
    for (const i of p.issues) bullet(`${titleCase(i.issueType)} — ${titleCase(i.status)}${i.description ? `: ${i.description}` : ""} (${fmtDate(i.createdAt)})`);

    sectionTitle("Incidents");
    if (!p.incidents.length) bullet("No incidents reported.", MUTED);
    for (const i of p.incidents) bullet(`${titleCase(i.incidentType)} — ${i.severity} / ${titleCase(i.status)} / claim ${titleCase(i.protectionClaimStatus)}${i.description ? `: ${i.description}` : ""} (${fmtDate(i.createdAt)})`, i.severity === "critical" || i.severity === "high" ? DANGER : INK);

    // ── Storage ─────────────────────────────────────────────────────────────
    sectionTitle("Storage Events");
    if (!p.storageEvents.length) bullet("No storage events.", MUTED);
    for (const s of p.storageEvents) bullet(`${titleCase(s.eventType)}${s.locationName ? ` @ ${s.locationName}` : ""} (${fmtDate(s.createdAt)})`);

    // ── Witness reports ─────────────────────────────────────────────────────
    sectionTitle("Witness Verification Reports");
    if (!p.witnessReports.length) bullet("No witness reports.", MUTED);
    for (const w of p.witnessReports) bullet(`${titleCase(w.reportType)} — witness #${w.witnessUserId}${w.notes ? `: ${w.notes}` : ""} (${fmtDate(w.createdAt)})`);

    // ── Full custody timeline ───────────────────────────────────────────────
    sectionTitle("Full Custody Timeline (append-only)");
    if (!p.timeline.length) bullet("No custody events.", MUTED);
    // Oldest → newest for a readable chronology.
    for (const e of [...p.timeline].reverse()) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const geo = e.lat != null && e.lng != null ? `  [${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}]` : "";
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(fmtDate(e.createdAt), left, doc.y, { width: 120, continued: true });
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(8).text(`  ${titleCase(e.eventType)}`, { continued: true });
      doc.fillColor(INK).font("Helvetica").fontSize(8).text(`${e.description ? ` — ${e.description}` : ""}${geo}`);
      doc.moveDown(0.15);
    }

    // ── Footer (page numbers) ───────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(MUTED).font("Helvetica").fontSize(7).text(
        `GUBER Verified Release System™ — generated ${fmtDate(new Date())} — page ${i - range.start + 1} of ${range.count}`,
        left, doc.page.height - 35, { width: contentWidth, align: "center" },
      );
    }

    doc.end();
  });
}
