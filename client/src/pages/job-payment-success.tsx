import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GuberLayout } from "@/components/guber-layout";
import { CheckCircle, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function JobPaymentSuccess() {
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(searchStr);
  const sessionId = params.get("session_id");
  const jobId = params.get("job_id");
  const jobType = params.get("job_type");
  const isVI = jobType === "vi";
  const [confirmed, setConfirmed] = useState(false);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/jobs/confirm-payment", { sessionId, jobId });
      return resp.json();
    },
    onSuccess: () => {
      setConfirmed(true);
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
    },
  });

  useEffect(() => {
    if (sessionId && jobId && !confirmed) {
      confirmMutation.mutate();
    }
  }, [sessionId, jobId]);

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-16 text-center" data-testid="page-payment-success">
        {confirmMutation.isPending ? (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="font-display text-lg">Confirming payment...</p>
          </div>
        ) : confirmed ? (
          <div className="space-y-4">
            {isVI ? (
              <>
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(76,29,149,0.1))", border: "1px solid rgba(139,92,246,0.3)" }}>
                  <Shield className="w-10 h-10" style={{ color: "#a78bfa" }} />
                </div>
                <h1 className="text-2xl font-display font-bold" style={{ color: "#a78bfa" }} data-testid="text-vi-success">
                  Request Submitted!
                </h1>
                <p className="text-muted-foreground">
                  Your verification request is live. Helpers can now see and accept it.
                </p>
                <div className="flex flex-col gap-3 justify-center mt-6">
                  <Button
                    onClick={() => navigate("/vi-requests")}
                    className="font-display"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)", color: "#fff", border: "none" }}
                    data-testid="button-view-vi-requests"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    View Open Requests
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/my-jobs")}
                    className="font-display border-border/30"
                    data-testid="button-view-my-jobs"
                  >
                    My Jobs
                  </Button>
                </div>
              </>
            ) : (
              <>
                <CheckCircle className="w-16 h-16 text-primary mx-auto" />
                <h1 className="text-2xl font-display font-bold guber-text-green" data-testid="text-job-success">Job Posted!</h1>
                <p className="text-muted-foreground">Your job is now live and visible to helpers.</p>
                <div className="flex gap-3 justify-center mt-6">
                  <Link href="/my-jobs">
                    <Button className="font-display bg-primary text-primary-foreground" data-testid="button-view-jobs">View My Jobs</Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button variant="outline" className="font-display border-border/30" data-testid="button-dashboard">Dashboard</Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-destructive font-display" data-testid="text-payment-failed">
              Payment confirmation failed. Please contact support or check My Jobs.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href={isVI ? "/vi-requests" : "/my-jobs"}>
                <Button variant="outline" className="font-display">
                  {isVI ? "View Requests" : "My Jobs"}
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" className="font-display">Dashboard</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
