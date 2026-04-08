import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, AlertCircle, Info } from "lucide-react"

function ToastIcon({ variant }: { variant?: string }) {
  if (variant === "destructive") {
    return (
      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center">
        <AlertCircle className="w-4 h-4 text-red-400" />
      </div>
    )
  }
  if (variant === "success") {
    return (
      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center">
        <CheckCircle2 className="w-4 h-4 text-green-400" />
      </div>
    )
  }
  return (
    <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
      <span className="text-[11px] font-black text-white/70 tracking-tight leading-none">G</span>
    </div>
  )
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={4000}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <ToastIcon variant={props.variant as string} />
            <div className="flex-1 min-w-0 pr-6">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
              {action && <div className="mt-2">{action}</div>}
            </div>
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
