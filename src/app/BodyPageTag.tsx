"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function BodyPageTag() {
  const pathname = usePathname();

  useEffect(() => {
    const page = String(pathname ?? "/")
      .split("?")[0]
      .split("#")[0]
      .split("/")
      .filter(Boolean)[0];

    if (page) document.body.dataset.page = page;
    else delete document.body.dataset.page;

    return () => {
      delete document.body.dataset.page;
    };
  }, [pathname]);

  return null;
}
