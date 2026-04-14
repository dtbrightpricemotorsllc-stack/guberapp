import { GuberLayout } from "@/components/guber-layout";
import { GuberLogo } from "@/components/guber-logo";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";

const LAST_UPDATED = "March 22, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] pb-6">
      <h2 className="text-primary font-display text-sm font-bold mb-3 uppercase tracking-widest">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground/80 leading-relaxed">{children}</div>
    </section>
  );
}

function AUPContent() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10" data-testid="page-acceptable-use">
      <div className="text-center mb-10">
        <GuberLogo size="md" />
        <h1 className="text-2xl font-display font-black mt-4 guber-text-green tracking-tight">ACCEPTABLE USE POLICY</h1>
        <p className="text-muted-foreground/50 text-xs font-display tracking-widest mt-2 uppercase">GUBER GLOBAL LLC · Last Updated: {LAST_UPDATED}</p>
      </div>

      <div className="space-y-6">
        <Section title="Platform Rule">
          <p className="text-foreground font-semibold border border-primary/20 rounded-xl p-4 bg-primary/[0.04]">
            GUBER allows visual verification, errands, inspections, documentation, and general task-based services. Jobs involving illegal activity, hazardous physical labor, or licensed professional services without proper credentials are prohibited.
          </p>
        </Section>

        <Section title="1. What GUBER Is For">
          <p>GUBER is designed for general task-based services including:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Errands, pickup/delivery, and general assistance</li>
            <li>Visual documentation, presence verification, and inspection reports</li>
            <li>General labor: moving help, yard work, cleaning, assembly</li>
            <li>Skilled tasks by qualified and properly credentialed providers</li>
            <li>Barter exchanges of goods and services between users</li>
            <li>Marketplace listings for items, services, and community resources</li>
          </ul>
        </Section>

        <Section title="2. Strictly Prohibited — Illegal Activity">
          <p>The following are absolutely prohibited on the Platform:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Buying, selling, transporting, or facilitating illegal drugs or controlled substances</li>
            <li>Any activity involving stolen goods, contraband, or black-market transactions</li>
            <li>Illegal weapons activity (sales, transport, modification)</li>
            <li>Procurement of alcohol or tobacco for minors</li>
            <li>Unauthorized entry, lock bypass, or burglary-style tasks</li>
            <li>Stalking, surveillance, or tracking of individuals without consent</li>
            <li>Identity fraud, creating fake documents, or impersonating others</li>
            <li>Any activity that constitutes a crime under local, state, or federal law</li>
          </ul>
        </Section>

        <Section title="3. Strictly Prohibited — Conduct Violations">
          <ul className="list-disc pl-5 space-y-1">
            <li>Harassment, threats, intimidation, or abusive communication toward any user</li>
            <li>Discrimination based on race, color, gender, identity, orientation, age, disability, or any protected class</li>
            <li>Fraud, misrepresentation, or deceptive practices of any kind</li>
            <li>Impersonating another user, GUBER staff, or any third party</li>
            <li>Privacy violations including sharing another user's personal information without consent</li>
            <li>Attempting to move transactions off the Platform to avoid platform fees</li>
            <li>Creating fake accounts, reviews, or referrals</li>
            <li>Any use of the Platform for sex work or adult-only services</li>
          </ul>
        </Section>

        <Section title="4. Prohibited — Dangerous / High-Risk Physical Work">
          <p>The following categories of physical work are prohibited due to their inherent risk and liability, regardless of the poster's or provider's intent:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Roof work, roofing repairs, or work above one full story height without proper safety equipment and licensing</li>
            <li>Tree felling, large-limb removal, or chainsaw work near structures or power lines</li>
            <li>High-ladder work (above 10 feet) without proper safety setup</li>
            <li>Heavy structural demolition or construction</li>
            <li>Hazardous electrical installation or panel work requiring licensure</li>
            <li>Confined space entry</li>
            <li>Hazardous material handling (asbestos, mold remediation, chemical disposal)</li>
          </ul>
          <p>General labor and yard work remain permitted. When in doubt, do not post or accept a job involving significant physical risk.</p>
        </Section>

        <Section title="5. Prohibited — Licensed Professional Services Without Credentials">
          <p>The following services require professional credentials and may only be offered by users who have verified the appropriate credentials on the Platform:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Legal advice, legal representation, or legal document preparation</li>
            <li>Medical advice, diagnosis, treatment, or any health-related professional service</li>
            <li>Structural engineering or load-bearing structural assessments</li>
            <li>Official home inspection reports (must be a licensed inspector)</li>
            <li>Code-compliance decisions or building permit certifications</li>
            <li>Licensed electrical or plumbing work requiring a contractor's license</li>
            <li>Certified mechanic diagnosis with safety certification</li>
            <li>Environmental assessments requiring professional licensure</li>
          </ul>
          <p>Visual-only documentation, presence verification, and photo/video proof jobs do not constitute professional services and are permitted within their defined scope.</p>
        </Section>

        <Section title="6. Verify & Inspect Scope Limitations">
          <p>All Verify & Inspect (V&I) jobs on GUBER are strictly limited to visual documentation. Providers performing V&I tasks:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>May only report what is visually present or absent</li>
            <li>May not provide mechanical diagnosis, fitment guarantees, or safety certifications</li>
            <li>May not offer structural, engineering, legal, or habitability opinions</li>
            <li>Must use the "not encountered" option when something cannot be visually confirmed</li>
          </ul>
          <p>This scope limitation is a platform rule, not just a disclaimer. Providers who exceed this scope may be removed from the Platform.</p>
        </Section>

        <Section title="7. Enforcement">
          <p>GUBER may, at its sole discretion:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Remove any job posting that violates this Policy</li>
            <li>Issue strikes to users who violate this Policy</li>
            <li>Temporarily suspend or permanently ban accounts</li>
            <li>Preserve and share evidence of violations with law enforcement when required</li>
            <li>Cooperate with investigations of crimes or fraud involving the Platform</li>
          </ul>
          <p>If you encounter a job or user that appears to violate this Policy, please report it immediately through the Report Abuse function in the app.</p>
        </Section>

        <Section title="8. Contact">
          <p>Questions about this Policy: <span className="text-primary">support@guberapp.com</span></p>
          <p className="mt-2 text-xs">
            Also see: <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link> · <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          </p>
        </Section>
      </div>
    </div>
  );
}

export default function AcceptableUse() {
  const { user } = useAuth();
  if (user) return <GuberLayout><AUPContent /></GuberLayout>;
  return <div className="min-h-screen bg-background"><AUPContent /></div>;
}
