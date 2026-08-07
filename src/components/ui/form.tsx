import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        variant === "primary" &&
          "bg-[var(--accent)] text-[var(--logo-ink)] hover:bg-[var(--accent-hover)]",
        variant === "secondary" &&
          "border border-[var(--border)] bg-[var(--bg-soft)] text-[var(--text)] hover:border-[var(--border-strong)]",
        variant === "danger" &&
          "border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20",
        variant === "ghost" && "text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text)]",
        className
      )}
      {...props}
    />
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-xs font-medium text-[var(--text-muted)]">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={cn(
          "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-1",
          error && "border-[var(--danger)]",
          className
        )}
        {...props}
      />
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
};

export function Select({ label, error, className, id, options, ...props }: SelectProps) {
  const selectId = id ?? props.name;
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={selectId} className="block text-xs font-medium text-[var(--text-muted)]">
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        className={cn(
          "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-1",
          error && "border-[var(--danger)]",
          className
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function Textarea({ label, className, id, ...props }: TextareaProps) {
  const areaId = id ?? props.name;
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={areaId} className="block text-xs font-medium text-[var(--text-muted)]">
          {label}
        </label>
      ) : null}
      <textarea
        id={areaId}
        className={cn(
          "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-1",
          className
        )}
        rows={3}
        {...props}
      />
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  size,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** lg ≈ wide, xl = document composer, full = near-viewport sheet */
  size?: "md" | "lg" | "xl" | "full";
}) {
  if (!open) return null;
  const resolved = size ?? (wide ? "lg" : "md");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-[fadeIn_0.15s_ease]"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl animate-[fadeIn_0.18s_ease]",
          "rounded-t-2xl sm:rounded-2xl",
          resolved === "md" && "max-w-lg max-h-[92vh]",
          resolved === "lg" && "max-w-2xl max-h-[92vh]",
          resolved === "xl" && "max-w-5xl max-h-[94vh]",
          resolved === "full" && "max-w-6xl max-h-[96vh] sm:h-[92vh]"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-soft)]/60 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[var(--text-muted)] transition hover:bg-[var(--bg)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-soft)]/40 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        active
          ? "bg-[var(--success)]/15 text-[var(--success)]"
          : "bg-[var(--text-muted)]/15 text-[var(--text-muted)]"
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function PageToolbar({
  search,
  onSearch,
  onAdd,
  addLabel = "Add",
  actions,
}: {
  search: string;
  onSearch: (v: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-1"
      />
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {onAdd ? <Button onClick={onAdd}>{addLabel}</Button> : null}
      </div>
    </div>
  );
}

export function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg-soft)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              {headers.map((h, i) => (
                <th key={`${h}-${i}`} className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {empty ? (
        <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No records found</div>
      ) : null}
    </div>
  );
}

export function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "info" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "error" && "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]",
        tone === "info" && "border-[var(--info)]/40 bg-[var(--info)]/10 text-[var(--info)]"
      )}
    >
      {children}
    </div>
  );
}
