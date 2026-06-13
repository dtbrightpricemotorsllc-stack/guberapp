import { GuberLayout } from "@/components/guber-layout";
import { GuberLogo } from "@/components/guber-logo";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";

const LAST_UPDATED = "June 13, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] pb-6">
      <h2 className="text-primary font-display text-sm font-bold mb-3 uppercase tracking-widest">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground/80 leading-relaxed">{children}</div>
    </section>
  );
}

function PrivacyContent() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10" data-testid="page-privacy">
      <div className="text-center mb-10">
        <GuberLogo size="md" />
        <h1 className="text-2xl font-display font-black mt-4 guber-text-green tracking-tight">PRIVACY POLICY</h1>
        <p className="text-muted-foreground text-xs font-display tracking-widest mt-2 uppercase">GUBER GLOBAL LLC · Last Updated: {LAST_UPDATED}</p>
      </div>

      <div className="space-y-6">
        <Section title="1. Introduction">
          <p>GUBER GLOBAL LLC ("GUBER," "we," "us") operates the GUBER platform ("Platform"). This Privacy Policy explains how we collect, use, store, and share information when you use our Platform. By using GUBER, you agree to this policy.</p>
          <p>The Platform is intended only for users 18 years of age or older. We do not knowingly collect personal information from anyone under 18.</p>
        </Section>

        <Section title="2. Information We Collect">
          <p><strong className="text-foreground">Identity & Account Data</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Full name, username, and public username/GUBER ID</li>
            <li>Email address</li>
            <li>Phone number (if provided)</li>
            <li>Profile photo and biography</li>
            <li>Password (stored in hashed/encrypted form — never readable)</li>
            <li>Date of birth or age verification information</li>
          </ul>
          <p><strong className="text-foreground">Location & Job Data</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>ZIP code and general location for job matching and service area preferences</li>
            <li>GPS coordinates (latitude/longitude) when you use location-based features</li>
            <li>Job addresses and location descriptions</li>
            <li>Clock-in and clock-out locations for work sessions</li>
            <li>During active Asset Protection and Transport jobs: continuous location updates collected in the background to provide shipment visibility, ETA, and safety monitoring. Background tracking begins only when a transporter starts a protected trip and stops immediately when the trip is completed, cancelled, or ended.</li>
          </ul>
          <p><strong className="text-foreground">Payment & Financial Data</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Stripe customer ID and connected account information</li>
            <li>Transaction history (amounts, dates, job references)</li>
            <li>Payout and fee records</li>
            <li>We do not store full card numbers or bank account numbers — Stripe handles all sensitive payment data</li>
          </ul>
          <p><strong className="text-foreground">Proof & Documentation Data</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Photos and videos submitted as proof of job completion</li>
            <li>Timestamps associated with proof submissions</li>
            <li>GPS/location data embedded in or associated with proof submissions</li>
            <li>Checklist responses and job notes submitted by Providers</li>
          </ul>
          <p><strong className="text-foreground">Identity Verification Data</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Government ID document type (we do not store the full document image)</li>
            <li>Selfie verification status</li>
            <li>Credential and background check status</li>
          </ul>
          <p><strong className="text-foreground">Device & Usage Data</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Device type, operating system, and browser</li>
            <li>IP address and general region</li>
            <li>Push notification tokens (for job alerts and trip updates)</li>
            <li>Pages visited and features used within the Platform</li>
            <li>Session timestamps and activity logs</li>
          </ul>
          <p><strong className="text-foreground">User-Generated Content</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Job postings and descriptions</li>
            <li>Reviews and ratings you submit or receive</li>
            <li>Messages sent through the Platform</li>
            <li>Reports of abuse or safety concerns</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use your information to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Create and manage your account</li>
            <li>Match job posters with available providers by location</li>
            <li>Show nearby jobs, listings, workers, transport requests, and local opportunities</li>
            <li>Process payments and payouts through Stripe</li>
            <li>Send push notifications about jobs near you, messages, offers, payments, verification updates, transport updates, and trip activity</li>
            <li>Provide shipment visibility, ETA updates, and safety monitoring during active Asset Protection and Transport trips</li>
            <li>Verify user identity and maintain trust tiers</li>
            <li>Review and investigate disputes, fraud, and abuse reports</li>
            <li>Preserve proof submissions and trip history for dispute resolution and safety compliance</li>
            <li>Improve Platform features and user experience</li>
            <li>Comply with legal obligations</li>
            <li>Communicate platform-wide announcements (if you opt in)</li>
          </ul>
        </Section>

        <Section title="4. Location Data — Detailed Disclosure">
          <p><strong className="text-foreground">Location While Using the App</strong></p>
          <p>GUBER collects your location while you are actively using the app to show nearby jobs, listings, workers, transport requests, and local opportunities. This requires "While Using the App" / "When In Use" location permission.</p>
          <p><strong className="text-foreground">Background Location (Asset Protection & Transport Only)</strong></p>
          <p>GUBER may collect your location in the background only during active Asset Protection and Transport jobs. Background tracking begins only when a transporter explicitly starts a protected trip and stops immediately when the trip is completed, cancelled, or ended by the transporter, customer, or admin. This requires "Always Allow" / background location permission, which is requested only at the moment a protected trip is started — never at signup.</p>
          <p>Background location data is used exclusively for: shipment visibility for the customer, ETA calculations, safety monitoring, and asset protection dispute documentation.</p>
          <p><strong className="text-foreground">Job Alerts Without Live GPS</strong></p>
          <p>Workers and providers can set a saved service area (ZIP code, city, and radius) to receive job alerts when the app is closed. These alerts use your saved area — not live GPS tracking.</p>
          <p><strong className="text-foreground">How to Turn Location Off</strong></p>
          <p>You can revoke location permissions at any time in your device settings. Revoking "While Using" permission will disable nearby job matching and map features. Revoking background location will disable Asset Protection tracking. Job alerts based on your saved ZIP code will continue to work regardless of live location permission.</p>
        </Section>

        <Section title="5. Push Notifications">
          <p>GUBER uses push notifications to alert you about: new jobs near your service area, new messages, offers received, counter-offers, offer acceptances and rejections, job accepted and completed events, payment updates, identity verification updates, transport and load board updates, and active trip activity.</p>
          <p>You can manage notification preferences in your device settings at any time. Disabling notifications will not affect your ability to use the Platform, but you may miss time-sensitive job alerts and messages.</p>
        </Section>

        <Section title="6. Camera & Photo Access">
          <p>GUBER uses camera and photo library access for: profile images, marketplace listing photos, identity verification photos, job completion proof photos and videos, pickup and delivery proof, hands-free Verify & Inspect capture, and dispute documentation. Camera and photo access is requested only when you use a feature that requires it.</p>
        </Section>

        <Section title="7. Trip History & Safety Records">
          <p>Location data collected during Asset Protection and Transport trips is retained as part of the trip record for dispute resolution, safety review, and legal compliance. Trip history including route points, timestamps, and completion status may be reviewed by GUBER admins in the event of a dispute or safety concern. Customers and transporters can view their own trip history in the Platform.</p>
        </Section>

        <Section title="8. How We Share Your Information">
          <p>We do not sell your personal data. We may share information in these circumstances:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">With other users:</strong> Your public username, GUBER ID, rating, and general location (fuzzed) are visible to other users. Your exact location is only revealed to a locked job's counterpart. During an active Asset Protection trip, your real-time location is shared with the customer who activated Asset Protection for that shipment.</li>
            <li><strong className="text-foreground">With Stripe:</strong> Payment-related data is shared with Stripe Inc. for payment processing and connected account onboarding.</li>
            <li><strong className="text-foreground">With service providers:</strong> We may share data with trusted third-party vendors who assist in operating the Platform.</li>
            <li><strong className="text-foreground">For legal compliance:</strong> We may disclose information when required by law, court order, or to protect the rights and safety of users or the public.</li>
            <li><strong className="text-foreground">In a business transfer:</strong> If GUBER is acquired or merges, your data may transfer to the new entity under equivalent protections.</li>
          </ul>
        </Section>

        <Section title="9. Data Retention">
          <p>We retain your account data as long as your account is active. Proof submissions, trip location records, transaction records, and dispute-related data may be retained for longer periods as required for legal compliance and dispute resolution. You may request deletion of your account by contacting support@guberapp.com; some records may be retained as required by law or for fraud prevention.</p>
        </Section>

        <Section title="10. Security">
          <p>We use industry-standard administrative, technical, and physical security measures to protect your information, including encrypted data storage, HTTPS transmission, and access controls. No system is perfectly secure, and we cannot guarantee absolute protection against all threats.</p>
          <p>Passwords are stored in a one-way hashed format and are never readable by GUBER staff.</p>
        </Section>

        <Section title="11. Your Rights">
          <p>Depending on your location, you may have rights to access, correct, delete, or port your personal data. To exercise these rights, contact us at support@guberapp.com. We will respond within 30 days.</p>
          <p>You may opt out of non-essential communications at any time through account settings.</p>
        </Section>

        <Section title="12. Cookies and Tracking">
          <p>The Platform uses session cookies for authentication and basic functionality. We do not use third-party advertising tracking cookies. Analytics data is used internally to improve the Platform.</p>
        </Section>

        <Section title="13. Third-Party Links">
          <p>The Platform may contain links to third-party services. We are not responsible for their privacy practices. Review third-party privacy policies before sharing information with them.</p>
        </Section>

        <Section title="14. Third-Party Sub-Processors">
          <p>We use the following key sub-processors that may access or process your data:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Stripe, Inc.</strong> — Payment processing, connected account onboarding, and identity verification. Stripe is the exclusive handler of your payment card data, bank account information, and identity documents — GUBER does not store card numbers or bank account details. <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">stripe.com/privacy</a>
            </li>
            <li>
              <strong className="text-foreground">Cloudinary</strong> — Photo and video storage for proof submissions and profile images.
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> — Transactional email delivery (account notifications, receipts, alerts).
            </li>
            <li>
              <strong className="text-foreground">Google Maps</strong> — Location lookup and map display. Location data entered on the Platform may be processed by Google's APIs subject to Google's Privacy Policy.
            </li>
            <li>
              <strong className="text-foreground">Apple Push Notification service (APNs)</strong> — Push notification delivery for iOS devices.
            </li>
            <li>
              <strong className="text-foreground">Firebase Cloud Messaging (FCM)</strong> — Push notification delivery for Android devices.
            </li>
          </ul>
          <p>All sub-processors are contractually obligated to maintain appropriate data security measures and use your data only as directed by GUBER.</p>
        </Section>

        <Section title="15. Contact">
          <p>For privacy questions or requests: <span className="text-primary">support@guberapp.com</span></p>
          <p>GUBER GLOBAL LLC | Greensboro, North Carolina, USA</p>
          <p className="mt-2 text-xs">
            Also see: <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link> · <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</Link>
          </p>
        </Section>
      </div>
    </div>
  );
}

export default function Privacy() {
  const { user } = useAuth();
  if (user) return <GuberLayout><PrivacyContent /></GuberLayout>;
  return <div className="min-h-screen bg-background"><PrivacyContent /></div>;
}
