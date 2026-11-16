import { Plus } from "lucide-react";

export const AddCircleButton = ({ label, onClick, disabled = false, className = "" }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-secondary bg-secondary text-secondary-foreground shadow-sm transition hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
  >
    <Plus className="h-5 w-5" aria-hidden="true" />
  </button>
);
