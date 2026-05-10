// /studio/mirror-motion — task-549.
// Dedicated full page for the Mirror Motion tool, replaces the old in-modal
// wizard. Reuses the session-based upload pipeline and the extracted form.
import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { MirrorMotionForm } from "@/components/studio/mirror-motion-form";

type StudioFile = {
  id: number;
  fileType: string;
  providerUrl: string;
};
type SessionPayload = { session: any; files: StudioFile[] };
type StudioMe = { credits: number };

export default function StudioMirrorMotionPage() {
  const { toast } = useToast();
  // Recreate-this prefill from /studio/explore. Captured once on mount and
  // handed to MirrorMotionForm as initialPrompt; query string then stripped.
  const searchString = useSearch();
  const prefillConsumedRef = useRef(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (prefillConsumedRef.current || !searchString) return;
    const p = new URLSearchParams(searchString).get("prompt");
    if (!p) return;
    prefillConsumedRef.current = true;
    setInitialPrompt(p);
    window.history.replaceState({}, "", "/studio/mirror-motion");
  }, [searchString]);
  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const sessionQuery = useQuery<SessionPayload>({
    queryKey: ["/api/studio/session/current"],
    refetchOnWindowFocus: false,
  });
  const uploadedImages = (sessionQuery.data?.files ?? []).filter((f) => f.fileType === "upload_image");
  const credits = meQuery.data?.credits ?? 0;

  const uploadMutation = useMutation({
    mutationFn: async ({ dataUrl, kind }: { dataUrl: string; kind: "image" }) => {
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      toast({ title: "Photo uploaded", description: "Pick it from the row above." });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  async function onUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image only", description: "Pick a JPG / PNG / WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too big", description: "Keep references under 25 MB.", variant: "destructive" });
      return;
    }
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || ""));
      r.onerror = () => rej(new Error("read failed"));
      r.readAsDataURL(file);
    });
    uploadMutation.mutate({ dataUrl, kind: "image" });
  }

  return (
    <StudioToolPageShell
      title="Mirror Motion"
      subtitle="Drop a photo + paste any direct video URL — we clone the motion of that clip onto your image. Pricing scales with length."
      iconAccent="from-rose-500 to-orange-500"
    >
      <MirrorMotionForm
        key={initialPrompt ?? ""}
        uploadedImages={uploadedImages}
        onUpload={onUpload}
        initialPrompt={initialPrompt}
        uploadPending={uploadMutation.isPending}
        credits={credits}
      />
    </StudioToolPageShell>
  );
}
