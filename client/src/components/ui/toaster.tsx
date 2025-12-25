import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react"

function getToastIcon(variant?: string, title?: string) {
  // Check variant first
  if (variant === "destructive") {
    return <AlertCircle className="h-5 w-5 text-destructive" />
  }

  // Infer from title
  const titleLower = title?.toLowerCase() || ""
  if (titleLower.includes("success") || titleLower.includes("copied") || titleLower.includes("saved") || titleLower.includes("created") || titleLower.includes("deleted")) {
    return <CheckCircle2 className="h-5 w-5 text-green-500" />
  }
  if (titleLower.includes("error") || titleLower.includes("failed")) {
    return <AlertCircle className="h-5 w-5 text-destructive" />
  }
  if (titleLower.includes("warning")) {
    return <AlertTriangle className="h-5 w-5 text-yellow-500" />
  }

  return <Info className="h-5 w-5 text-primary" />
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const icon = getToastIcon(variant ?? undefined, typeof title === "string" ? title : undefined)

        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">{icon}</div>
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
