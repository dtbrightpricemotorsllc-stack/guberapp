import { Link } from "wouter";
import { ArrowLeft, Trash2, Shield, Mail } from "lucide-react";

export default function DeleteAccount() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider mb-8 transition-colors" data-testid="link-back-home">
          <ArrowLeft className="w-3.5 h-3.5" />
          BACK TO GUBER
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight" data-testid="heading-delete-account">Delete Your Account</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-10">Learn how to permanently delete your GUBER account and associated data.</p>

        <section className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold font-display mb-3" data-testid="heading-how-to-delete">How to Delete Your Account</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground leading-relaxed">
              <li>Open the GUBER app and sign in to your account.</li>
              <li>Tap your <strong className="text-foreground">Profile</strong> icon, then go to <strong className="text-foreground">Account Settings</strong>.</li>
              <li>Scroll to the bottom and tap <strong className="text-foreground">"Delete Account"</strong>.</li>
              <li>Confirm the deletion when prompted. Your account will be permanently removed.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold font-display mb-3" data-testid="heading-what-gets-deleted">What Gets Deleted</h2>
            <p className="text-sm text-muted-foreground mb-3">When you delete your account, the following data is permanently removed:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> Your profile information (name, email, photo, bio)</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> Job history and postings</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> Reviews and ratings</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> Wallet and transaction history</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> Notification preferences and push subscriptions</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> Verification documents and trust data</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span> Business account and subscription data (if applicable)</li>
            </ul>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
            <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold mb-1">Data Retention</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Account deletion is permanent and cannot be undone. All personal data is removed immediately upon deletion. 
                Anonymized, non-identifiable transaction records may be retained for legal and financial compliance purposes for up to 90 days.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold font-display mb-3" data-testid="heading-cant-access">Can't Access Your Account?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              If you're unable to log in and want your account deleted, contact us directly and we'll process your request within 48 hours.
            </p>
            <a
              href="mailto:support@guberapp.app?subject=Account%20Deletion%20Request"
              className="inline-flex items-center gap-2 text-sm font-display font-semibold text-primary hover:underline"
              data-testid="link-email-support"
            >
              <Mail className="w-4 h-4" />
              support@guberapp.app
            </a>
          </div>
        </section>

        <div className="mt-12 pt-6 border-t border-border/30 text-center">
          <p className="text-xs text-muted-foreground font-display">GUBER &middot; guberapp.app</p>
        </div>
      </div>
    </div>
  );
}
