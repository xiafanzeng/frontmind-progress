import { createContext, createElement, useContext, type ReactNode } from "react";

export type OptimizedQuestionOption = {
  id: string;
  question: string;
  category?: string | null;
};

const OptimizedQuestionsContext = createContext<
  OptimizedQuestionOption[] | undefined
>(undefined);

export function OptimizedQuestionsProvider({
  questions,
  children,
}: {
  questions: OptimizedQuestionOption[] | undefined;
  children: ReactNode;
}) {
  return createElement(OptimizedQuestionsContext.Provider, { value: questions }, children);
}

/**
 * Optimized questions (优化问题) available to import into a monitor.
 * Only populated when the monitoring module is embedded in a dashboard
 * surface that owns purchased questions; undefined hides the entry.
 */
export function useOptimizedQuestions(): OptimizedQuestionOption[] | undefined {
  const questions = useContext(OptimizedQuestionsContext);
  return questions;
}
