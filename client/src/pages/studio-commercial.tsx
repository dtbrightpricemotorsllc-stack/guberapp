// /studio/commercial — task-549.
// Dedicated full page for the Commercial Builder, replaces the old in-modal wizard.
import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StudioToolPageShell } from "@/components/studio/studio-tool-page-shell";
import { CommercialWizardForm } from "@/components/studio/commercial-wizard";

type StudioFile = { id: number; fileType: string; providerUrl: string };
type SessionPayload = { session: any; files: StudioFile[] };
type StudioMe = { credits: number };
type StudioTool = { key: string; creditsCost: number };

export default function StudioCommercialPage() {
  const { toast } = useToast();
  const searchString = useSearch();
  const prefillConsumedRef = useRef(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (prefillConsumedRef.current || !searchString) return;
    const p = new URLSearchParams(searchString).get("prompt");
    if (!p) return;
    prefillConsumedRef.current = true;
    setInitialPrompt(p);
    window.history.replaceState({}, "", "/studio/commercial");
  }, [searchString]);
  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const toolsQuery = useQuery<StudioTool[]>({ queryKey: ["/api/studio/tools"] });
  const sessionQuery = useQuery<SessionPayload>({
    queryKey: ["/api/studio/session/current"],
    refetchOnWindowFocus: false,
  });
  const uploadedImages = (sessionQuery.data?.files ?? []).filter((f) => f.fileType === "upload_image");
  const credits = meQuery.data?.credits ?? 0;
  const cost = (toolsQuery.data ?? []).find((t) => t.key === "commercial_builder")?.creditsCost ?? 200;

  const uploadMutation = useMutation({
    mutationFn: async ({ dataUrl, kind }: { dataUrl: string; kind: "image" }) => {
      const res = await apiRequest("POST", "/api/studio/upload", { dataUrl, kind });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
      toast({ title: "Photo uploaded" });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  async function onUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image only", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too big", description: "Keep photos under 25 MB.", variant: "destructive" });
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
      title="Build a Commercial"
      subtitle="A guided four-step builder: pick your vertical, drop a hero photo, fill in your business info, and we composite a motion + music + voiceover ad. Final cost depends on length and voiceover."
      iconAccent="from-amber-400 to-rose-600"
    >
      <CommercialWizardForm
        key={initialPrompt ?? ""}
        uploadedImages={uploadedImages}
        onUpload={onUpload}
        initialPrompt={initialPrompt}
        uploadPending={uploadMutation.isPending}
        credits={credits}
        cost={cost}
      />
    </StudioToolPageShell>
  );
}
