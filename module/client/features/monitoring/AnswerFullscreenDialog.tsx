import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import type { RunAttempt } from "../../domain";
import CitationRail from "./CitationRail";
import { AnswerReader } from "./AnswerWorkspace";
import type { SourceScope } from "./types";

export default function AnswerFullscreenDialog({
  open,
  attempt,
  returnFocusRef,
  onOpenChange,
  sourceScope,
  onSourceScopeChange,
  toolbar,
  insights,
  loading,
  navigationError,
}: {
  toolbar: ReactNode;
  insights: ReactNode;
  loading?: boolean;
  navigationError?: string;
  open: boolean;
  attempt: RunAttempt;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  sourceScope: SourceScope;
  onSourceScopeChange: (scope: SourceScope) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0, behavior: "instant" });
  }, [attempt.id]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal
        container={document.getElementById("monitoring-module-portals")}
      >
        <Dialog.Overlay className="fm-dialog-overlay fm-fullscreen-overlay" />
        <Dialog.Content
          className="fm-fullscreen-dialog fm-reading-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <Dialog.Title className="fm-visually-hidden">
            全屏问答明细
          </Dialog.Title>
          <Dialog.Description className="fm-visually-hidden">
            全屏查看回答正文和引用信源。
          </Dialog.Description>
          <div ref={contentRef} className="fm-fullscreen-reading">
            {toolbar}
            {navigationError && (
              <p className="fm-navigation-error" role="alert">
                {navigationError}
              </p>
            )}
            <section className="fm-current-question" aria-label="当前回答问题">
              <strong>{attempt.question}</strong>
            </section>
            <AnswerReader attempt={attempt} loading={loading} />
            {insights}
            <CitationRail
              attempt={attempt}
              scope={sourceScope}
              onScopeChange={onSourceScopeChange}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
