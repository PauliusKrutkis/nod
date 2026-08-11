import { cn } from "../cn/cn.ts";
import "./spinner.css";

export function Spinner({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("q-spinner", className)}>
      <span aria-hidden="true" className="q-spinner-disc" />
      {label ? <span className="q-spinner-label">{label}</span> : null}
    </div>
  );
}
