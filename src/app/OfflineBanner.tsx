"use client";

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => {
      const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      setOnline(isOnline);
      document.documentElement.dataset.offline = isOnline ? "false" : "true";
    };

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="card offline-banner">
      <div style={{ fontWeight: 900 }}>Sin conexión</div>
      <div className="small">
        Estás sin internet. Los cambios no se guardarán. Trabaja en modo manual hasta que regrese la conexión.
      </div>
    </div>
  );
}
