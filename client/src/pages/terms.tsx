import { GuberLayout } from "@/components/guber-layout";
import { GuberLogo } from "@/components/guber-logo";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";

const LAST_UPDATED = "March 22, 2026";
const CONTACT = "support@guberapp.com | GUBER APP LLC | Greensboro, North Carolina, USA";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] pb-6">
      <h2 className="text-primary font-display text-sm font-bold mb-3 uppercase tracking-widest">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground/80 leading-relaxed">{children}</div>
    </section>
  );
}

function TermsContent() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10" data-testid="page-terms">
      <div className="text-center mb-10">
        <GuberLogo size="md" />
        <h1 className="text-2xl font-display font-black mt-4 guber-text-green tracking-tight">TERMS OF SERVICE</h1>
        <p className="text-muted-foreground/50 text-xs font-display tracking-widest mt-2 uppercase">GUBER APP LLC · Last Updated: {LAST_UPDATED}</p>
      </div>

      {/* Plain-English Summary Box */}
      <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <p className="text-xs font-display font-bold text-primary uppercase tracking-widest mb-3">Plain-English Summary</p>
        <ul className="space-y-2 text-[13px] text-muted-foreground/80 leading-relaxed">
          <li>✅ GUBER connects workers with job posters — we are not your employer.</li>
          <li>✅ You are an independent contractor. You set your own schedule.</li>
          <li>✅ Stripe holds your payment securely until the job is confirmed done — GUBER never holds your money.</li>
          <li>✅ GUBER takes a 20% platform fee (15% for Day-1 OG members). Stripe issues your 1099-K if you earn $600+/year.</li>
          <li>✅ You must be legally authorized to work in the United States to accept paid jobs.</li>
          <li>✅ Disputes are resolved via AAA arbitration in Guilford County, NC — no class actions.</li>
          <li>⚠️ This summary is for convenience only. The full terms below are legally binding.</li>
        </ul>
      </div>

      <div className="space-y-6">
        <Section title="1. Acceptance of Terms">
          <p>By accessing or using the GUBER platform ("Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Platform. You must be at least 18 years old to create an account.</p>
          <p>GUBER APP LLC reserves the right to modify these Terms at any time. Continued use of the Platform after changes are posted constitutes acceptance of the updated Terms.</p>
        </Section>

        <Section title="2. What GUBER Is — And Is Not">
          <p><strong className="text-foreground">GUBER is a technology platform</strong> that connects independent users who wish to offer or receive local task-based services. GUBER is not an employer, staffing agency, insurer, licensed inspector, transportation company, or professional services firm.</p>
          <p>GUBER does not supervise, direct, control, or manage how any user performs services. GUBER does not participate in any agreement between users and makes no representations about the quality, safety, legality, timeliness, reliability, or any other aspect of the services provided by or to users through the Platform.</p>
          <p>The Platform provides connection tools, messaging infrastructure, payment facilitation, and proof/documentation tools. Nothing more.</p>
        </Section>

        <Section title="3. Independent Contractor Status">
          <p>All users who perform services through the Platform ("Providers") are independent contractors. They are not employees, agents, partners, or joint venturers of GUBER. Providers choose whether to accept or decline any job, set their own schedule, use their own tools and judgment, and determine how to complete tasks.</p>
          <p>Users who post jobs ("Posters") are also independent of GUBER. Nothing in these Terms or on the Platform creates an employment, agency, or supervisory relationship between GUBER and any user.</p>
        </Section>

        <Section title="4. No Guarantees">
          <p>GUBER does not guarantee:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The quality, safety, legality, or results of any service</li>
            <li>That a Provider is licensed, insured, or qualified for any task</li>
            <li>The accuracy of any job posting, description, or user-submitted content</li>
            <li>The identity, background, or conduct of any user</li>
            <li>Availability of any service at any time or location</li>
            <li>That the Platform will be available without interruption or error</li>
          </ul>
        </Section>

        <Section title="5. User Responsibilities">
          <p>You are solely responsible for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Complying with all applicable laws, regulations, and licensing requirements</li>
            <li>Maintaining any required insurance, permits, or credentials for services you offer or request</li>
            <li>Exercising your own judgment about safety, suitability, and risk</li>
            <li>The accuracy of all content you submit to the Platform</li>
            <li>Your conduct toward other users at all times</li>
            <li>Reporting and paying all applicable taxes on earnings from Platform activities</li>
          </ul>
          <p>GUBER does not withhold taxes or issue W-2s. <strong className="text-foreground">Stripe (our payment processor) issues 1099-K forms</strong> to Providers whose earnings through the Platform meet the applicable IRS reporting threshold ($600 or more in a calendar year). GUBER does not issue tax documents. Consult a tax professional for guidance on your obligations.</p>
        </Section>

        <Section title="6. Legal Work Authorization">
          <p>By accepting paid jobs through the Platform, you represent and warrant that you are legally authorized to work in the United States. You are solely responsible for compliance with all applicable immigration, work permit, and visa laws. GUBER does not verify, sponsor, or guarantee any user's work authorization status.</p>
          <p>If you are not legally authorized to perform compensated work in the United States, you may not accept paid jobs through the Platform. GUBER disclaims all liability for any violations of immigration or employment law by users.</p>
        </Section>

        <Section title="7. Assumption of Risk">
          <p>By using the Platform, you expressly acknowledge and assume all risks associated with hiring, meeting, or performing services for other users, including but not limited to physical injury, property damage, theft, fraud, and financial loss.</p>
          <p>Users should exercise caution when meeting unknown persons. Use public, well-lit locations where appropriate. Do not perform tasks beyond your qualifications or physical ability. For emergencies, call 911. GUBER is not an emergency response service.</p>
        </Section>

        <Section title="8. Payments and Funds">
          <p>Payments are processed through <strong className="text-foreground">Stripe</strong>, our third-party payment processor. GUBER charges a platform application fee per transaction (currently 20% for standard users; 15% for Day-1 OG members; reductions may apply through the referral program).</p>
          <p><strong className="text-foreground">How payment hold works:</strong> Funds are held in trust by Stripe, GUBER's payment processing partner, until job completion is confirmed. GUBER does not hold funds in a fiduciary capacity and is not a bank. When job completion is confirmed by both parties (or after any applicable review period expires without dispute), GUBER instructs Stripe to capture and release the funds directly to the Provider's connected bank account. GUBER retains only the application fee portion at the time of capture.</p>
          <p>Refunds are handled on a case-by-case basis under GUBER's dispute resolution policy. If a dispute is resolved in the Poster's favor before funds are captured, Stripe cancels the authorization — no charge is made. If funds have already been captured, a standard Stripe refund is issued. GUBER may assist in resolving disputes but does not guarantee any particular outcome.</p>
          <p>GUBER does not provide insurance coverage for any services performed through the Platform. You are responsible for any insurance you deem appropriate.</p>
        </Section>

        <Section title="9. Proof and Documentation System">
          <p>The Platform includes a Proof Engine that may require Providers to submit photos, videos, GPS location data, timestamps, and checklist responses to confirm job completion. This documentation may be used to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Confirm job completion for payment release</li>
            <li>Review and investigate disputes between users</li>
            <li>Detect and investigate abuse, fraud, or platform misuse</li>
            <li>Improve platform safety and compliance</li>
          </ul>
          <p>By using the Platform, you consent to the collection and use of proof submissions as described herein and in the Privacy Policy.</p>
        </Section>

        <Section title="10. Prohibited Activities">
          <p>You may not use the Platform for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Any illegal activity or facilitating illegal conduct</li>
            <li>Offering or requesting licensed professional services (legal, medical, engineering, structural inspection, electrical, plumbing) without proper credentials</li>
            <li>Hazardous physical labor including roof work, tree felling, high-ladder work, heavy structural demolition, confined space work, or hazardous electrical installation</li>
            <li>Transactions involving illegal drugs, controlled substances, firearms, stolen goods, or contraband</li>
            <li>Stalking, surveillance, unauthorized entry, or privacy violations</li>
            <li>Harassment, threats, or intimidation of any user</li>
            <li>Fraud, impersonation, or misrepresentation of identity or qualifications</li>
            <li>Any activity prohibited under the Acceptable Use Policy</li>
          </ul>
          <p>GUBER reserves the right to remove any job posting that violates these Terms without notice.</p>
        </Section>

        <Section title="11. Limitation of Liability">
          <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, GUBER APP LLC, ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE PLATFORM OR ANY SERVICES OBTAINED THROUGH IT.</p>
          <p>To the extent GUBER has any liability, it shall be limited to the platform fees paid by you for the specific transaction giving rise to the claim, not to exceed $100 in any case.</p>
        </Section>

        <Section title="12. Indemnification">
          <p>You agree to defend, indemnify, and hold harmless GUBER APP LLC and its affiliates from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or related to: your use of the Platform; any services you provide or receive; your violation of these Terms or any applicable law; any injury, loss, or damage caused by you to any person or property; or any content you submit to the Platform.</p>
        </Section>

        <Section title="13. Account Suspension and Removal">
          <p>GUBER reserves the right, at its sole discretion, to suspend, restrict, or permanently terminate any user account or remove any content or job posting that violates these Terms, the Acceptable Use Policy, or that GUBER determines is harmful to the Platform or its users.</p>
          <p>Users may accrue strikes for violations. Three strikes may result in automatic suspension. Severe violations may result in immediate permanent bans without prior warning.</p>
        </Section>

        <Section title="14. Intellectual Property">
          <p>All content, trademarks, logos, and technology on the Platform are owned by or licensed to GUBER APP LLC. You may not reproduce, distribute, or create derivative works without written permission.</p>
          <p>By submitting content to the Platform (photos, descriptions, proof submissions), you grant GUBER a non-exclusive, royalty-free license to use that content for the purposes described in these Terms and the Privacy Policy.</p>
        </Section>

        <Section title="15. Dispute Resolution and Binding Arbitration">
          <p>These Terms shall be governed by the laws of the State of North Carolina, USA, without regard to conflict of law principles.</p>
          <p><strong className="text-foreground">Informal Resolution First.</strong> Before initiating any formal proceeding, you agree to give GUBER at least 30 days' written notice of your dispute by emailing support@guberapp.com with a description of the claim and the relief sought. GUBER will attempt to resolve the dispute informally during that period.</p>
          <p><strong className="text-foreground">Binding Arbitration.</strong> If informal resolution fails, any dispute, claim, or controversy arising out of or relating to these Terms or the Platform (including their formation, interpretation, breach, or termination) shall be resolved by binding individual arbitration administered by the American Arbitration Association ("AAA") under its Consumer Arbitration Rules, which are available at <a href="https://www.adr.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">adr.org</a>. The arbitration shall be conducted in Guilford County, North Carolina, or via remote means if both parties agree. The arbitrator's decision shall be final and binding and may be entered as a judgment in any court of competent jurisdiction.</p>
          <p><strong className="text-foreground">Class Action Waiver.</strong> You waive any right to participate in or receive money from a class-action lawsuit, class-wide arbitration, private attorney general action, or any other representative proceeding against GUBER.</p>
          <p><strong className="text-foreground">Exception.</strong> Either party may seek emergency injunctive or equitable relief in a court of competent jurisdiction in Guilford County, North Carolina to prevent irreparable harm, without waiving the right to arbitrate all other claims.</p>
          <p><strong className="text-foreground">Fees.</strong> AAA filing fees are governed by the AAA Consumer Arbitration Rules. GUBER will not seek attorneys' fees in arbitration unless the arbitrator finds your claim frivolous.</p>
        </Section>

        <Section title="16. General Safety">
          <p>GUBER strongly encourages all users to exercise good judgment and take reasonable safety precautions. Only accept or post jobs you are genuinely qualified and able to perform. Meet in safe, public locations when possible. Trust your instincts — if something feels unsafe, do not proceed. For any emergency, call 911 immediately.</p>
        </Section>

        <Section title="17. Contact">
          <p>{CONTACT}</p>
          <p>For questions about these Terms, email us at <span className="text-primary">support@guberapp.com</span>.</p>
          <p className="mt-2 text-xs">
            Also see: <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> · <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</Link>
          </p>
        </Section>
      </div>
    </div>
  );
}

export default function Terms() {
  const { user } = useAuth();
  if (user) return <GuberLayout><TermsContent /></GuberLayout>;
  return <div className="min-h-screen bg-background"><TermsContent /></div>;
}
