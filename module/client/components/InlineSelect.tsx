import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import "./InlineSelect.css";

type Option = { value: string; label: string; disabled?: boolean };

/** In-flow disclosure: opening choices increases the form height, without a portal. */
export default function InlineSelect({ label, value, options, onChange }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);
  useEffect(() => {
    if (open) (list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') || list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
  }, [open]);
  return <div className="fm-inline-select" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  }}>
    <button ref={trigger} type="button" className="fm-inline-select-trigger" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined}
      onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
      <span>{selected?.label || value || "请选择"}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div ref={list} id={id} role="listbox" aria-label={label} className="fm-inline-select-options" onKeyDown={event => {
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      let next = -1;
      if (event.key === "ArrowDown") next = (current + 1) % buttons.length;
      else if (event.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
        for (let offset = 1; offset <= buttons.length; offset += 1) {
          const index = (current + offset) % buttons.length;
          if (buttons[index]?.textContent?.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())) { next = index; break; }
        }
      }
      if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
    }}>
      {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} tabIndex={-1}
        onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus({ preventScroll: true }); }}>
        <span>{option.label}</span>{option.value === value && <Check size={14} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
