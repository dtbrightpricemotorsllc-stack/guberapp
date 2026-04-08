import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { GuberLogo } from "@/components/guber-logo";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4" data-testid="page-not-found">
      <div className="text-center space-y-4">
        <GuberLogo size="md" />
        <h1 className="text-5xl font-display font-bold guber-text-green">404</h1>
        <p className="text-muted-foreground">Page not found</p>
        <Link href="/">
          <Button variant="outline" className="gap-2 font-display border-border/30" data-testid="button-go-home">
            <ArrowLeft className="w-4 h-4" /> Go Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
