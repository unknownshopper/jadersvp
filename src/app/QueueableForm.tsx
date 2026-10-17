"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { enqueuePost, fieldsFromFormData } from "@/lib/offlineQueue";

// Form that submits via fetch and falls back to the local offline queue
// on network failure. Wraps server-rendered operational forms so they
// keep working during an outage and replay on reconnect.
export default function QueueableForm({
  action,
  confirmText,
  className,
  style,
  children
}: {
  action: string;
  confirmText?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={action}
      method="post"
      className={className}
      style={style}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget;
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(true);
        const fd = new FormData(form);
        try {
          const res = await fetch(action, { method: "POST", body: fd, credentials: "same-origin" });
          if (res.status === 401 || res.status === 403) {
            window.location.href = "/login";
            return;
          }
          if (res.status >= 500) throw new Error(`HTTP_${res.status}`);
          window.location.href = res.redirected && res.url ? res.url : "/hostess";
        } catch {
          enqueuePost(action, fieldsFromFormData(fd));
          window.alert(
            "Sin conexión. La operación quedó guardada en este dispositivo y se enviará automáticamente cuando regrese el internet."
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </form>
  );
}
