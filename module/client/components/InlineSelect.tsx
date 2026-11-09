import { useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import "./InlineSelect.css";

type Option = { value: string; label: string; disabled?: boolean };

/** Keep the form control in place; render choices outside its layout/scroll container. */
export default function InlineSelect({ label, value, options, onChange }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Stay inside an enclosing dialog focus trap, but outside the scrolling form.
  const portalContainer = trigger.current?.closest<HTMLElement>('[role="dialog"]') || (typeof document !== "undefined" ? document.fullscreenElement : null);
  const selected = options.find(option => option.value === value);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <div className="fm-inline-select">
      <Popover.Trigger asChild>
        <button ref={trigger} type="button" className="fm-inline-select-trigger" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined}
          onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
          <span>{selected?.label || value || "请选择"}</span><ChevronDown size={14} aria-hidden="true" />
        </button>
      </Popover.Trigger>
    </div>
    <Popover.Portal container={portalContainer || undefined}>
      <Popover.Content className="fm-inline-select-popover" align="start" sideOffset={6} collisionPadding={12} collisionBoundary={portalContainer || undefined}
        onOpenAutoFocus={event => {
          event.preventDefault();
          const option = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') || list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
          option?.focus({ preventScroll: true });
          // Popper resolves its available height after mounting; scroll only the list.
          requestAnimationFrame(() => {
            if (option?.isConnected && list.current) {
              const offset = option.getBoundingClientRect().top - list.current.getBoundingClientRect().top;
              list.current.scrollTop += offset - (list.current.clientHeight - option.offsetHeight) / 2;
            }
          });
        }}>
        <div ref={list} id={id} role="listbox" aria-label={label} className="fm-inline-select-options" onKeyDown={event => {
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
          if (next >= 0) { event.preventDefault(); buttons[next]?.focus({ preventScroll: true }); }
        }}>
          {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} tabIndex={-1}
            onClick={() => { onChange(option.value); setOpen(false); }}>
            <span>{option.label}</span>{option.value === value && <Check size={14} aria-hidden="true" />}
          </button>)}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
