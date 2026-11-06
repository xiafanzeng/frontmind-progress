import { useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import "./MonitoringSelect.css";

export default function MonitoringSelect({ label, value, options, disabled, onChange }: {
  label: string; value: string; options: Array<{ value: string; label: string }>;
  disabled?: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);
  const focusOption = (index: number) => list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]?.focus();
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button type="button" className="fm-select-trigger" aria-label={label} aria-haspopup="listbox" aria-controls={open ? listId : undefined} disabled={disabled || !options.length} title={selected?.label}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
      <span>{selected?.label || "暂无记录"}</span><ChevronDown size={14} />
    </button></Popover.Trigger>
    <Popover.Portal container={typeof document !== "undefined" ? document.fullscreenElement || undefined : undefined}><Popover.Content data-slot="popover-content" className="fm-select-popover" align="start" sideOffset={6} collisionPadding={12} onOpenAutoFocus={event => {
      event.preventDefault(); focusOption(Math.max(0, options.findIndex(option => option.value === value)));
    }}>
      <div ref={list} role="listbox" id={listId} aria-label={label} onKeyDown={event => {
        const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const target = event.key === "ArrowDown" ? (index + 1) % buttons.length : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
        if (target >= 0) { event.preventDefault(); focusOption(target); }
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
          const match = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
          if (match >= 0) { event.preventDefault(); focusOption(match); }
        }
      }}>
        {options.map(option => <button type="button" role="option" key={option.value} aria-selected={option.value === value} tabIndex={option.value === value ? 0 : -1} onClick={() => { onChange(option.value); setOpen(false); }}><span>{option.label}</span>{option.value === value && <Check size={14} />}</button>)}
      </div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
