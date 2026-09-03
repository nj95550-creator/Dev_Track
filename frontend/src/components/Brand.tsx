import type { ReactElement } from "react";

interface BrandProps {
  compact?: boolean;
}

// Reusable identity block shared by the authentication screen and workspace shell.
export function Brand({ compact = false }: BrandProps): ReactElement {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <span>D</span>
      </span>
      <span className="brand-copy">
        <strong>DevTrack</strong>
        {!compact && <small>Development workspace</small>}
      </span>
    </div>
  );
}
