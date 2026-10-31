/**
 * Shared DevTrack wordmark and icon. Compact mode removes only the workspace
 * caption so the same identity fits loading, footer and recovery layouts.
 */
import { Layers2 } from 'lucide-react';
/**
 * Render the common wordmark with an optional workspace caption.
 */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Layers2 size={21} strokeWidth={2.3} />
      </span>
      <strong>
        devtrack<span>.</span>
      </strong>
      {!compact && <span className="brand-version">WORKSPACE</span>}
    </div>
  );
}
