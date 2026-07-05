"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./info-tip.module.css";

interface InfoTipProps {
  text: string;
  label?: string;
}

export function InfoTip({ text, label = "More information" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.btn}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <div id={tipId} className={styles.popover} role="tooltip">
          <p dangerouslySetInnerHTML={{ __html: text }} />
        </div>
      )}
    </div>
  );
}
