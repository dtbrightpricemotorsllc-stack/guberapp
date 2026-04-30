import { ShieldCheck, MapPin, CalendarDays, Clock, AlertCircle } from "lucide-react";

export type CredentialCardData = {
  id?: number | string;
  qualificationName: string;
  credentialType?: string | null;
  issuingAuthority?: string | null;
  expirationDate?: string | Date | null;
  documentUrl?: string | null;
  verificationStatus?: "pending" | "verified" | "rejected" | string;
};

function formatExpiration(value: string | Date | null | undefined): { label: string; expired: boolean } | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;
  const expired = date.getTime() < Date.now();
  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return { label, expired };
}

type CredentialCardProps = {
  credential: CredentialCardData;
  variant?: "full" | "compact";
  pending?: boolean;
};

export function CredentialCard({ credential, variant = "full", pending }: CredentialCardProps) {
  const exp = formatExpiration(credential.expirationDate);
  const expired = !!exp?.expired;
  const isPending = pending || credential.verificationStatus === "pending";
  const isRejected = credential.verificationStatus === "rejected";

  const baseClass = expired
    ? "border-amber-500/30 bg-amber-500/5"
    : isRejected
      ? "border-red-500/30 bg-red-500/5"
      : isPending
        ? "border-border/30 bg-muted/20"
        : "border-emerald-500/25 bg-gradient-to-br from-emerald-500/5 via-card to-card";

  if (variant === "compact") {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border ${baseClass} px-2.5 py-1.5`}
        data-testid={`credential-card-compact-${credential.id ?? credential.qualificationName}`}
      >
        <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${expired ? "text-amber-500" : "text-emerald-500"}`} />
        <span className="text-[11px] font-semibold truncate flex-1" title={credential.qualificationName}>
          {credential.qualificationName}
        </span>
        {expired && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500">Expired</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border ${baseClass} p-4 space-y-3 ${expired ? "opacity-80" : ""}`}
      data-testid={`credential-card-${credential.id ?? credential.qualificationName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight" data-testid={`credential-name-${credential.id ?? credential.qualificationName}`}>
            {credential.qualificationName}
          </p>
          {credential.credentialType && (
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
              {credential.credentialType}
            </p>
          )}
        </div>
        {isPending ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/40 border border-border/40 rounded-full px-2 py-1 shrink-0">
            <Clock className="w-3 h-3" /> Pending Review
          </span>
        ) : isRejected ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-1 shrink-0">
            <AlertCircle className="w-3 h-3" /> Rejected
          </span>
        ) : expired ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-1 shrink-0">
            <AlertCircle className="w-3 h-3" /> Expired
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white bg-emerald-600 rounded-full px-2 py-1 shrink-0 shadow-sm"
            data-testid={`credential-verified-badge-${credential.id ?? credential.qualificationName}`}
          >
            <ShieldCheck className="w-3 h-3" /> Document Verified (Visual)
          </span>
        )}
      </div>

      {(credential.issuingAuthority || exp) && (
        <div className="flex flex-col gap-1.5 text-xs">
          {credential.issuingAuthority && (
            <div className="flex items-start gap-2 text-muted-foreground" data-testid={`credential-authority-${credential.id ?? credential.qualificationName}`}>
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500/80" />
              <span className="leading-snug">{credential.issuingAuthority}</span>
            </div>
          )}
          {exp && (
            <div className="flex items-center gap-2 text-muted-foreground" data-testid={`credential-expiration-${credential.id ?? credential.qualificationName}`}>
              <CalendarDays className={`w-3.5 h-3.5 shrink-0 ${expired ? "text-amber-500" : "text-emerald-500/80"}`} />
              <span className={expired ? "text-amber-500 font-semibold" : ""}>
                {expired ? "Expired " : "Expires "}{exp.label}
              </span>
            </div>
          )}
        </div>
      )}

      {credential.documentUrl && (
        <a
          href={credential.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-[10px] text-primary hover:underline"
          data-testid={`credential-document-link-${credential.id ?? credential.qualificationName}`}
        >
          View source document
        </a>
      )}
    </div>
  );
}
