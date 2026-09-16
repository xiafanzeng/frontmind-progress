import {
  KEYWORD_CATEGORY_OPTIONS,
  keywordCategoryKey,
  type KeywordCategoryKey,
} from "@frontmind/module-ui/keyword-categories";
import {
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  CircleHelp,
  FileUp,
  Globe2,
  ListChecks,
  ListPlus,
  MonitorSmartphone,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@frontmind/module-ui/components/ui/dropdown-menu";

import {
  calculateAttempts,
  dedupeQuestions,
  modelReasoningSupport,
  type CompetitorInput,
  type MonitorInput,
  type MonitoringQuestionSeed,
  type ProjectSummary,
  type ProviderModel,
  type RegionOption,
  type ScheduleType,
  type ScreenshotPolicy,
} from "../domain";
import {
  absoluteMoneyTenThousandths,
  formatCnyTenThousandths,
  hasEnoughMoneyTenThousandths,
  subtractMoneyTenThousandths,
} from "../billingView";
import {
  buildRunCostQuoteInput,
  type QuoteRunCost,
  type RunCostQuoteInput,
  type RunCostQuoteView,
} from "../runBilling";
import ModelBrandIcon from "./ModelBrandIcon";
import { useOptimizedQuestions } from "./OptimizedQuestionsContext";
import { DemoBrandPicker, DemoKeywordPanel } from "./DemoMonitorFields";
import "./MonitorForm.css";

type MonitorFormProps = {
  project: ProjectSummary;
  models: ProviderModel[];
  availableBalanceTenThousandths: string;
  quoteRunCost: QuoteRunCost;
  regions?: RegionOption[];
  initial?: MonitorInput;
  onDraftChange?: (value: MonitorInput) => void;
  seedQuestions?: Array<string | MonitoringQuestionSeed>;
  demoMode?: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (
    value: MonitorInput,
    runNow: boolean,
    idempotencyKey?: string,
    quote?: RunCostQuoteView,
  ) => void | Promise<unknown>;
};

const weekdays = [
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
  "星期日",
];

const preferredDefaultModelCodes = ["doubao", "yuanbao", "deepseek"];
const mixedRegionValue = "__mixed_platform_regions__";
const screenshotOptions = [
  [0, "不截图"],
  [2, "提及品牌时截图"],
  [1, "全部截图"],
] as const;

function modelDisplayName(model: ProviderModel) {
  const suffix =
    model.clientType === "mobile"
      ? /(?:移动端|手机版)$/u
      : /(?:网页版|网页端)$/u;
  return model.name.replace(suffix, "").trim() || model.name;
}

function modelAccessibleName(model: ProviderModel) {
  return `${modelDisplayName(model)}${model.clientType === "web" ? "网页版" : "手机版"}`;
}

type CompetitorDraft = {
  name: string;
  aliases: string;
};

function competitorDrafts(
  competitors: readonly CompetitorInput[],
): CompetitorDraft[] {
  return competitors.map((competitor) => ({
    name: competitor.name,
    aliases: competitor.aliases.join("，"),
  }));
}

function parseAliases(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[，,\n]/u)
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  );
}

export function normalizeMonitorCompetitors(
  drafts: readonly CompetitorDraft[],
): CompetitorInput[] {
  return drafts.flatMap((draft) => {
    const name = draft.name.trim();
    if (!name) return [];
    return [{ name, aliases: parseAliases(draft.aliases) }];
  });
}

function formatRunMoney(value: string) {
  return formatCnyTenThousandths(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function isValidTimezone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value.trim() }).format();
    return true;
  } catch {
    return false;
  }
}

/** Only genuinely overseas platforms (ChatGPT family) use overseas regions;
 * every domestic model picks from province-level regions. */
function isOverseasPlatform(model: ProviderModel) {
  return /chatgpt|openai|gpt/i.test(`${model.code} ${model.name}`);
}

function defaultSelectedModels(models: ProviderModel[]) {
  const available = models;
  const preferred = preferredDefaultModelCodes
    .map(
      (code) =>
        available.find(
          (model) =>
            model.code.toLowerCase() === code && model.clientType === "web",
        ) || available.find((model) => model.code.toLowerCase() === code),
    )
    .filter((model): model is ProviderModel => Boolean(model));
  return [
    ...preferred,
    ...available.filter((model) => !preferred.includes(model)),
  ].slice(0, 3);
}

function supportsScreenshotPolicy(
  model: ProviderModel,
  policy: ScreenshotPolicy,
) {
  // Effective capability follows the vendor submit contract (0/1/2 accepted
  // for every model); acceptance records are diagnostics and never gate the
  // selectable options.
  if (policy === 0) return true;
  return Boolean(model.capabilities.screenshot);
}

function defaultScreenshotPolicy(model: ProviderModel): ScreenshotPolicy {
  if (supportsScreenshotPolicy(model, 1)) return 1;
  if (supportsScreenshotPolicy(model, 2)) return 2;
  return 0;
}

const readQuestionFile = (file: File) => {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
};

export default function MonitorForm({
  project,
  models,
  availableBalanceTenThousandths,
  quoteRunCost,
  regions = [],
  initial,
  seedQuestions,
  demoMode = false,
  submitting,
  onCancel,
  onSubmit,
  onDraftChange,
}: MonitorFormProps) {
  const submitInFlight = useRef(false);
  const immediateRequest = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const [name, setName] = useState(initial?.name || "");
  const [competitors, setCompetitors] = useState<CompetitorDraft[]>(() =>
    competitorDrafts(initial ? initial.competitors : project.competitors),
  );
  const [questionText, setQuestionText] = useState(
    (
      initial?.questions ??
      seedQuestions?.map((item) =>
        typeof item === "string" ? item : item.question,
      )
    )?.join("\n") || "",
  );
  const [questionCategories, setQuestionCategories] = useState<
    Record<string, KeywordCategoryKey>
  >(
    () =>
      initial?.questionCategories ||
      Object.fromEntries(
        (seedQuestions || []).flatMap((item) =>
          typeof item !== "string" && item.category
            ? [[item.question.trim(), item.category]]
            : [],
        ),
      ),
  );
  const [questionDraft, setQuestionDraft] = useState("");
  const initialBrandAliases = initial?.brandAliases?.length
    ? initial.brandAliases
    : [project.brandName, ...project.brandAliases];
  const [brandName, setBrandName] = useState(initialBrandAliases[0] || "");
  const [brandAliasText, setBrandAliasText] = useState(
    initialBrandAliases.slice(1).join("、"),
  );
  const [questionMode, setQuestionMode] = useState<"list" | "batch">("list");
  const [questionImportOpen, setQuestionImportOpen] = useState(false);
  const [questionImportDraft, setQuestionImportDraft] = useState("");
  const [questionImportError, setQuestionImportError] = useState("");
  const [optimizedImportOpen, setOptimizedImportOpen] = useState(false);
  const [optimizedSearch, setOptimizedSearch] = useState("");
  const [optimizedSelected, setOptimizedSelected] = useState<string[]>([]);
  const [optimizedVisibleCount, setOptimizedVisibleCount] = useState(30);
  const optimizedImportControl = useRef<HTMLDivElement>(null);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<
    number | null
  >(null);
  const [editingQuestionDraft, setEditingQuestionDraft] = useState("");
  const questionFileInput = useRef<HTMLInputElement>(null);
  const questionImportControl = useRef<HTMLDivElement>(null);
  const questionImportButton = useRef<HTMLButtonElement>(null);
  const questionImportTextarea = useRef<HTMLTextAreaElement>(null);
  const editingQuestionInput = useRef<HTMLInputElement>(null);
  const defaultModels = defaultSelectedModels(models);
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      initial?.platforms.map((item) => [item.platformId, true]) ||
        defaultModels.map((model) => [model.id, true]),
    ),
  );
  const [reasoning, setReasoning] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      initial?.platforms.map((item) => [
        item.platformId,
        item.mode === "reasoning_search",
      ]) || [],
    ),
  );
  const [screenshots, setScreenshots] = useState<
    Record<string, ScreenshotPolicy>
  >(() =>
    Object.fromEntries([
      ...models.map(
        (model) => [model.id, defaultScreenshotPolicy(model)] as const,
      ),
      ...(initial?.platforms.map(
        (platform) => [platform.platformId, platform.screenshot] as const,
      ) || []),
    ]),
  );
  const [regionCodes, setRegionCodes] = useState<Record<string, string | null>>(
    () =>
      Object.fromEntries([
        ...models.map((model) => [model.id, null] as const),
        ...(initial?.platforms.map(
          (platform) =>
            [
              platform.platformId,
              platform.clientType === "mobile" ? null : platform.regionCode,
            ] as const,
        ) || []),
      ]),
  );
  const [repetitions, setRepetitions] = useState(initial?.repetitions ?? 2);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    initial?.schedule.type || "daily",
  );
  const [scheduleFrequency, setScheduleFrequency] = useState<
    Exclude<ScheduleType, "none">
  >(initial?.schedule.type === "weekly" ? "weekly" : "daily");
  const [timezone, setTimezone] = useState(
    initial?.schedule.timezone || project.timezone || "Asia/Shanghai",
  );
  const [localTime, setLocalTime] = useState(
    initial?.schedule.localTime || "09:30",
  );
  const [weekday, setWeekday] = useState(initial?.schedule.weekday || 1);
  const [error, setError] = useState("");
  const errorId = useId();
  const questionImportTitleId = useId();
  const questionImportHelpId = useId();

  const normalized = useMemo(
    () => dedupeQuestions(questionText),
    [questionText],
  );
  const selectedModels = useMemo(
    () => models.filter((model) => selected[model.id]),
    [models, selected],
  );
  const nameInvalid = Boolean(error && !name.trim());
  const questionsInvalid = Boolean(
    error &&
      (!normalized.questions.length ||
        normalized.questions.length > 50 ||
        normalized.questions.some((question) => question.length > 4_000)),
  );
  const modelsInvalid = Boolean(error && !selectedModels.length);
  const normalizedCompetitors = useMemo(
    () => normalizeMonitorCompetitors(competitors),
    [competitors],
  );
  const competitorNames = normalizedCompetitors.map((competitor) =>
    competitor.name.toLocaleLowerCase("zh-CN"),
  );
  const competitorsInvalid = Boolean(
    error &&
      (competitors.some((competitor) => !competitor.name.trim()) ||
        normalizedCompetitors.length > 50 ||
        new Set(competitorNames).size !== competitorNames.length ||
        normalizedCompetitors.some(
          (competitor) =>
            competitor.name.length > 120 ||
            competitor.aliases.length > 50 ||
            competitor.aliases.some((alias) => alias.length > 120),
        )),
  );
  const availableModels = models;
  const allAvailableModelsSelected =
    availableModels.length > 0 &&
    availableModels.every((model) => selected[model.id]);
  const selectedReasoningModels = selectedModels.filter(
    (model) => modelReasoningSupport(model) === "supported",
  );
  const allSelectedReasoningEnabled =
    selectedReasoningModels.length > 0 &&
    selectedReasoningModels.every((model) => reasoning[model.id]);
  const invalidReasoningModels = selectedModels.filter(
    (model) =>
      reasoning[model.id] && modelReasoningSupport(model) !== "supported",
  );
  const configuredPlatforms = useMemo(
    () =>
      selectedModels.map((model) => ({
        platformId: model.id,
        providerCode: model.code,
        clientType: model.clientType,
        mode: reasoning[model.id]
          ? ("reasoning_search" as const)
          : ("search" as const),
        // Pass the chosen policy through unchanged; the submit and quote
        // paths apply the same 0/1/2 validation server-side.
        screenshot: screenshots[model.id] ?? defaultScreenshotPolicy(model),
        regionCode:
          model.clientType === "mobile" ||
          (!model.capabilities.region && !model.capabilities.overseas)
            ? null
            : (regionCodes[model.id] ?? null),
      })),
    [reasoning, regionCodes, screenshots, selectedModels],
  );
  const attemptCount = calculateAttempts(
    normalized.questions.length,
    configuredPlatforms.length,
    repetitions,
  );
  const quoteInput = useMemo(
    () =>
      buildRunCostQuoteInput({
        questions: normalized.questions,
        platforms: configuredPlatforms,
        repetitions,
      }),
    [configuredPlatforms, normalized.questions, repetitions],
  );
  const quoteFingerprint = JSON.stringify(quoteInput);
  const quoteEligible =
    attemptCount > 0 &&
    attemptCount <= 500 &&
    invalidReasoningModels.length === 0;
  const [quoteState, setQuoteState] = useState<{
    fingerprint: string;
    loading: boolean;
    quote?: RunCostQuoteView;
    error?: string;
  }>(() => ({ fingerprint: "", loading: false }));
  const currentQuote =
    quoteState.fingerprint === quoteFingerprint ? quoteState.quote : undefined;
  const quoteLoading = Boolean(
    quoteEligible &&
      (quoteState.fingerprint !== quoteFingerprint || quoteState.loading),
  );
  const quoteError =
    quoteState.fingerprint === quoteFingerprint ? quoteState.error : undefined;
  const balanceSufficient = Boolean(
    currentQuote &&
      hasEnoughMoneyTenThousandths(
        availableBalanceTenThousandths,
        currentQuote.totalAmountTenThousandths,
      ),
  );
  const estimatedRemaining = currentQuote
    ? subtractMoneyTenThousandths(
        availableBalanceTenThousandths,
        currentQuote.totalAmountTenThousandths,
      )
    : undefined;
  const balanceShortfall =
    estimatedRemaining?.startsWith("-") === true
      ? absoluteMoneyTenThousandths(estimatedRemaining)
      : undefined;
  const domesticWebModels = selectedModels.filter(
    (model) => model.clientType === "web" && !isOverseasPlatform(model),
  );
  const overseasWebModels = selectedModels.filter(
    (model) => model.clientType === "web" && isOverseasPlatform(model),
  );
  const hasMobile = selectedModels.some(
    (model) => model.clientType === "mobile",
  );
  const screenshotValues = new Set(
    selectedModels.map(
      (model) => screenshots[model.id] ?? defaultScreenshotPolicy(model),
    ),
  );
  const bulkScreenshot =
    screenshotValues.size === 1 ? screenshotValues.values().next().value : null;
  const unsupportedScreenshotCount = selectedModels.filter(
    (model) => !model.capabilities.screenshot,
  ).length;
  const bulkRegionValue = (scopedModels: ProviderModel[]) => {
    const values = new Set(
      scopedModels.map((model) => regionCodes[model.id] ?? ""),
    );
    if (values.size > 1) return mixedRegionValue;
    return values.values().next().value || "";
  };
  const domesticRegion = bulkRegionValue(domesticWebModels);
  const overseasRegion = bulkRegionValue(overseasWebModels);
  const formValidForRun =
    Boolean(name.trim()) &&
    normalized.questions.length > 0 &&
    normalized.questions.length <= 50 &&
    normalized.questions.every(
      (question) =>
        question.length <= 4_000 &&
        (questionCategories[question] || initial?.questions.includes(question)),
    ) &&
    selectedModels.length > 0 &&
    selectedModels.length <= 50 &&
    invalidReasoningModels.length === 0 &&
    competitors.every((competitor) => Boolean(competitor.name.trim())) &&
    normalizedCompetitors.length <= 50 &&
    new Set(competitorNames).size === competitorNames.length &&
    normalizedCompetitors.every(
      (competitor) =>
        competitor.name.length <= 120 &&
        competitor.aliases.length <= 50 &&
        competitor.aliases.every((alias) => alias.length <= 120),
    ) &&
    true;
  const canRun =
    formValidForRun &&
    attemptCount > 0 &&
    attemptCount <= 500 &&
    !quoteLoading &&
    Boolean(currentQuote) &&
    balanceSufficient;

  useEffect(() => {
    if (!quoteEligible) {
      setQuoteState({ fingerprint: quoteFingerprint, loading: false });
      return;
    }

    // Parent query/mutation updates can recreate equal model/input objects.
    // Bind this request to the semantic fingerprint, not their identities.
    const input: RunCostQuoteInput = JSON.parse(quoteFingerprint);
    let cancelled = false;
    setQuoteState({ fingerprint: quoteFingerprint, loading: true });
    void Promise.resolve()
      .then(() => quoteRunCost(input))
      .then(
        (quote) => {
          if (!cancelled) {
            setQuoteState({
              fingerprint: quoteFingerprint,
              loading: false,
              quote,
            });
          }
        },
        () => {
          if (!cancelled) {
            setQuoteState({
              fingerprint: quoteFingerprint,
              loading: false,
              error: "费用估算暂不可用",
            });
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [quoteEligible, quoteFingerprint, quoteRunCost]);

  useEffect(() => {
    if (!questionImportOpen) return;
    questionImportTextarea.current?.focus();

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !questionImportControl.current?.contains(event.target)
      ) {
        setQuestionImportOpen(false);
        setQuestionImportError("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setQuestionImportOpen(false);
      setQuestionImportError("");
      questionImportButton.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [questionImportOpen]);

  useEffect(() => {
    if (!optimizedImportOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !optimizedImportControl.current?.contains(event.target)
      ) {
        setOptimizedImportOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOptimizedImportOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [optimizedImportOpen]);

  useEffect(() => {
    if (editingQuestionIndex === null) return;
    editingQuestionInput.current?.focus();
    editingQuestionInput.current?.select();
  }, [editingQuestionIndex]);

  const toggleAllAvailableModels = () => {
    const nextSelected = !allAvailableModelsSelected;
    setSelected((value) => {
      const next = { ...value };
      for (const model of availableModels) next[model.id] = nextSelected;
      return next;
    });
  };

  const toggleReasoningForSelectedModels = () => {
    const nextReasoning = !allSelectedReasoningEnabled;
    setReasoning((value) => {
      const next = { ...value };
      for (const model of selectedReasoningModels) {
        next[model.id] = nextReasoning;
      }
      return next;
    });
  };

  const setScreenshotForSelectedModels = (screenshot: ScreenshotPolicy) => {
    setScreenshots((value) => {
      const next = { ...value };
      for (const model of selectedModels) {
        if (supportsScreenshotPolicy(model, screenshot)) {
          next[model.id] = screenshot;
        }
      }
      return next;
    });
  };

  const setRegionForModels = (
    scopedModels: ProviderModel[],
    regionCode: string,
  ) => {
    setRegionCodes((value) => {
      const next = { ...value };
      for (const model of scopedModels) next[model.id] = regionCode || null;
      return next;
    });
  };

  const replaceQuestions = (questions: string[]) =>
    setQuestionText(questions.join("\n"));

  const addQuestion = () => {
    const additions = dedupeQuestions(questionDraft).questions;
    if (!additions.length) return setError("请输入要添加的问题。");
    const combined = dedupeQuestions(
      [...normalized.questions, ...additions].join("\n"),
    );
    if (combined.questions.length > 50)
      return setError("每个监控最多 50 个问题。");
    replaceQuestions(combined.questions);
    setQuestionDraft("");
    setError("");
  };

  const beginQuestionEdit = (index: number, question: string) => {
    setEditingQuestionIndex(index);
    setEditingQuestionDraft(question);
  };

  const cancelQuestionEdit = () => {
    setEditingQuestionIndex(null);
    setEditingQuestionDraft("");
  };

  const saveQuestionEdit = (index: number) => {
    const question = editingQuestionDraft.trim();
    if (!question) {
      setError("问题不能为空，已保留原内容。");
      cancelQuestionEdit();
      return;
    }
    if (
      normalized.questions.some(
        (existingQuestion, questionIndex) =>
          questionIndex !== index && existingQuestion === question,
      )
    ) {
      setError("该问题已存在，未保存重复内容。");
      cancelQuestionEdit();
      return;
    }
    const questions = [...normalized.questions];
    const priorQuestion = questions[index];
    if (priorQuestion && questionCategories[priorQuestion])
      setQuestionCategories((current) => ({
        ...current,
        [question]: current[priorQuestion],
      }));
    questions[index] = question;
    replaceQuestions(questions);
    setError("");
    cancelQuestionEdit();
  };

  const removeQuestion = (index: number) => {
    replaceQuestions(
      normalized.questions.filter(
        (_, questionIndex) => questionIndex !== index,
      ),
    );
    if (editingQuestionIndex === index) cancelQuestionEdit();
  };

  const importQuestions = (content: string) => {
    const imported = dedupeQuestions(content);
    if (!imported.questions.length) {
      setQuestionImportError("请粘贴问题，或先选择一个 TXT 文件。");
      return false;
    }
    const combined = dedupeQuestions(
      [...normalized.questions, ...imported.questions].join("\n"),
    );
    if (combined.questions.length > 50) {
      setQuestionImportError("导入后将超过 50 个问题，请删减后重试。");
      return false;
    }
    replaceQuestions(combined.questions);
    setQuestionImportError("");
    setError("");
    return true;
  };

  const optimizedQuestions = useOptimizedQuestions();
  const filteredOptimizedQuestions = useMemo(() => {
    if (!optimizedQuestions?.length) return [];
    const keyword = optimizedSearch.trim().toLocaleLowerCase("zh-CN");
    return keyword
      ? optimizedQuestions.filter((item) =>
          item.question.toLocaleLowerCase("zh-CN").includes(keyword),
        )
      : optimizedQuestions;
  }, [optimizedQuestions, optimizedSearch]);
  const visibleOptimizedQuestions = filteredOptimizedQuestions.slice(
    0,
    optimizedVisibleCount,
  );
  const toggleOptimizedQuestion = (id: string) => {
    setOptimizedSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  };
  const confirmOptimizedImport = () => {
    if (!optimizedQuestions?.length || !optimizedSelected.length) return;
    const selectedQuestions = optimizedQuestions
      .filter((item) => optimizedSelected.includes(item.id))
      .map((item) => item.question);
    if (!importQuestions(selectedQuestions.join("\n"))) return;
    setQuestionCategories((current) => ({
      ...current,
      ...Object.fromEntries(
        optimizedQuestions
          .filter((item) => optimizedSelected.includes(item.id))
          .flatMap((item) => {
            const category = keywordCategoryKey(item.category);
            return category ? [[item.question.trim(), category]] : [];
          }),
      ),
    }));
    setOptimizedImportOpen(false);
    setOptimizedSelected([]);
    setOptimizedSearch("");
    setOptimizedVisibleCount(30);
  };

  const importQuestionFile = async (file?: File) => {
    if (!file) return;
    try {
      const content = await readQuestionFile(file);
      setQuestionImportDraft(content);
      setQuestionImportError("");
    } catch {
      setQuestionImportError("TXT 文件读取失败，请重试或直接粘贴问题。");
    }
  };

  const setScheduleEnabled = (enabled: boolean) => {
    setScheduleType(enabled ? scheduleFrequency : "none");
  };

  const addCompetitor = () => {
    if (competitors.length >= 50) {
      setError("每个监控最多添加 50 个竞品。");
      return;
    }
    setCompetitors((items) => [...items, { name: "", aliases: "" }]);
    setError("");
  };

  const updateCompetitor = (
    index: number,
    field: keyof CompetitorDraft,
    value: string,
  ) => {
    setCompetitors((items) =>
      items.map((competitor, competitorIndex) =>
        competitorIndex === index
          ? { ...competitor, [field]: value }
          : competitor,
      ),
    );
    setError("");
  };

  const removeCompetitor = (index: number) => {
    setCompetitors((items) =>
      items.filter((_, competitorIndex) => competitorIndex !== index),
    );
    setError("");
  };

  const brandAliases = [
    ...new Set(
      [brandName.trim(), ...brandAliasText.split(/[,，、;；]+/)]
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ];

  const buildValue = (): MonitorInput => ({
    name: name.trim(),
    brandAliases,
    competitors: normalizedCompetitors,
    questions: normalized.questions,
    questionCategories: Object.fromEntries(
      normalized.questions.flatMap((question) =>
        questionCategories[question]
          ? [[question, questionCategories[question]]]
          : [],
      ),
    ),
    platforms: configuredPlatforms,
    repetitions,
    schedule: {
      type: scheduleType,
      timezone,
      localTime: scheduleType === "none" ? undefined : localTime,
      weekday: scheduleType === "weekly" ? weekday : undefined,
    },
  });

  const draftFingerprint = JSON.stringify(buildValue());
  const lastDraftFingerprint = useRef(draftFingerprint);
  const draftCallback = useRef(onDraftChange);
  draftCallback.current = onDraftChange;
  useEffect(() => {
    if (lastDraftFingerprint.current === draftFingerprint) return;
    lastDraftFingerprint.current = draftFingerprint;
    draftCallback.current?.(JSON.parse(draftFingerprint));
  }, [draftFingerprint]);

  const validateAndSubmit = async (runNow: boolean) => {
    if (submitting || submitInFlight.current) return;
    if (!name.trim()) return setError("请填写监控名称。");
    if (!brandName.trim()) return setError("请填写监控品牌。");
    if (!normalized.questions.length)
      return setError("请至少添加一个监控问题。");
    if (normalized.questions.length > 50)
      return setError("每个监控最多 50 个问题。");
    const overlongQuestionIndex = normalized.questions.findIndex(
      (question) => question.length > 4_000,
    );
    if (overlongQuestionIndex >= 0)
      return setError(
        `第 ${overlongQuestionIndex + 1} 个问题超过 4,000 个字符，请精简后再保存。`,
      );
    if (
      normalized.questions.some(
        (question) =>
          !questionCategories[question] &&
          !initial?.questions.includes(question),
      )
    )
      return setError("请为新增问题选择分类。");
    if (!selectedModels.length) return setError("请至少选择一个已开放模型。");
    if (invalidReasoningModels.length)
      return setError(
        `${invalidReasoningModels.map(modelAccessibleName).join("、")}的深度思考当前不可用，请关闭深度思考或取消选择后保存。`,
      );
    if (selectedModels.length > 50)
      return setError("每个监控最多选择 50 个模型。");
    if (attemptCount > 500)
      return setError("本次运行超过 500 次上限，请减少问题、模型或重复次数。");
    if (competitors.some((competitor) => !competitor.name.trim()))
      return setError("请先填写竞品名称，或删除未完成的竞品。");
    if (normalizedCompetitors.length > 50)
      return setError("每个监控最多添加 50 个竞品。");
    if (new Set(competitorNames).size !== competitorNames.length)
      return setError("竞品名称不能重复，请合并重复竞品后再保存。");
    const invalidCompetitorIndex = normalizedCompetitors.findIndex(
      (competitor) =>
        competitor.name.length > 120 ||
        competitor.aliases.length > 50 ||
        competitor.aliases.some((alias) => alias.length > 120),
    );
    if (invalidCompetitorIndex >= 0)
      return setError(
        `第 ${invalidCompetitorIndex + 1} 个竞品名称或别名超过限制，请精简后再保存。`,
      );
    if (runNow && quoteLoading)
      return setError("正在计算最大预计费用，请稍候再执行。");
    if (runNow && !currentQuote)
      return setError("暂无法获取官方费用估算，仍可先保存监控配置。");
    if (runNow && !balanceSufficient)
      return setError("当前可用余额不足，无法立即执行；仍可先保存监控配置。");
    if (scheduleType !== "none") {
      if (!isValidTimezone(timezone)) {
        return setError("请输入有效的 IANA 时区，例如 Asia/Shanghai。");
      }
    }
    setError("");
    const value = buildValue();
    let idempotencyKey: string | undefined;
    if (runNow) {
      const fingerprint = JSON.stringify(value);
      if (immediateRequest.current?.fingerprint !== fingerprint) {
        immediateRequest.current = {
          fingerprint,
          idempotencyKey: `ui:${crypto.randomUUID()}`,
        };
      }
      idempotencyKey = immediateRequest.current.idempotencyKey;
    }
    submitInFlight.current = true;
    try {
      await onSubmit(value, runNow, idempotencyKey, currentQuote);
    } finally {
      submitInFlight.current = false;
    }
  };

  return (
    <form
      className="monitor-form monitor-form-v2"
      noValidate
      aria-busy={submitting || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        void validateAndSubmit(false);
      }}
    >
      <div className="monitor-form-body">
        <div className="monitor-form-left">
          <div className="monitor-basic-grid">
            <label className="field">
              <span className="field-label">
                监控名称 <b aria-hidden="true">*</b>
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：核心品牌问题监控"
                maxLength={80}
                required
                aria-invalid={nameInvalid || undefined}
                aria-describedby={nameInvalid ? errorId : undefined}
              />
            </label>
            {demoMode ? (
              <DemoBrandPicker projectBrand={project.brandName} />
            ) : (
              <>
                <label className="field">
                  <span className="field-label">
                    监控品牌 <small>默认继承项目，可修改</small>
                  </span>
                  <input
                    value={brandName}
                    maxLength={120}
                    placeholder="输入本监控的品牌名称"
                    onChange={(event) => setBrandName(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    品牌别名 <small>可选</small>
                  </span>
                  <input
                    value={brandAliasText}
                    placeholder="多个别名用「、」或「,」分隔"
                    onChange={(event) => setBrandAliasText(event.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          <section
            className="monitor-competitor-section"
            aria-label="竞品快照"
            aria-invalid={competitorsInvalid || undefined}
            aria-describedby={competitorsInvalid ? errorId : undefined}
          >
            <div className="monitor-competitor-heading">
              <div>
                <strong>竞品快照</strong>
                <small>
                  {initial
                    ? "来自当前监控版本，保存后生成新的不可变快照"
                    : "已从项目预填，可为本监控单独调整"}
                </small>
              </div>
              <button
                type="button"
                className="competitor-add-button"
                disabled={competitors.length >= 50}
                onClick={addCompetitor}
              >
                <Plus size={13} />
                添加竞品
              </button>
            </div>
            <div className="monitor-competitor-editor">
              {competitors.length ? (
                competitors.map((competitor, index) => (
                  <div className="monitor-competitor-row" key={index}>
                    <span className="monitor-competitor-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <label>
                      <span className="sr-only">竞品 {index + 1} 名称</span>
                      <input
                        aria-label={`竞品 ${index + 1} 名称`}
                        value={competitor.name}
                        maxLength={120}
                        placeholder="竞品名称"
                        onChange={(event) =>
                          updateCompetitor(index, "name", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span className="sr-only">竞品 {index + 1} 别名</span>
                      <input
                        aria-label={`竞品 ${index + 1} 别名`}
                        value={competitor.aliases}
                        maxLength={6_000}
                        placeholder="别名用逗号分隔（可选）"
                        onChange={(event) =>
                          updateCompetitor(index, "aliases", event.target.value)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="competitor-remove-button"
                      aria-label={`删除竞品 ${index + 1}`}
                      onClick={() => removeCompetitor(index)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="monitor-competitor-empty">
                  <strong>暂未设置竞品</strong>
                  <span>可只监控主品牌，也可添加竞品进行对比。</span>
                </div>
              )}
            </div>
          </section>
          <div
            className={`question-workbench ${demoMode ? "with-demo-keywords" : ""}`}
          >
            {demoMode && <DemoKeywordPanel />}
            <section className="questions-section question-editor-panel">
              <div className="section-heading">
                <div>
                  <h3>
                    监控问题 <b aria-hidden="true">*</b>
                    <span className="sr-only">（必填）</span>
                  </h3>
                  <p id="monitor-question-help">
                    支持逐条编辑、导入问题或批量粘贴，自动去空行和精确重复。
                  </p>
                </div>
                <div className="question-editor-actions">
                  {Boolean(optimizedQuestions?.length) && (
                    <div
                      className="question-import-control question-optimized-control"
                      ref={optimizedImportControl}
                    >
                      <button
                        type="button"
                        className="optimized-import-button"
                        aria-haspopup="dialog"
                        aria-expanded={optimizedImportOpen}
                        aria-controls={
                          optimizedImportOpen
                            ? "monitor-optimized-import"
                            : undefined
                        }
                        onClick={() => setOptimizedImportOpen((open) => !open)}
                      >
                        <ListChecks size={12} />
                        从优化问题导入
                      </button>
                      {optimizedImportOpen && (
                        <div
                          className="question-import-popover optimized-import-popover"
                          id="monitor-optimized-import"
                          role="dialog"
                          aria-label="从优化问题导入"
                        >
                          <div className="question-import-heading">
                            <strong>从优化问题导入</strong>
                            <span>勾选优化问题，确认后追加到监控问题列表</span>
                          </div>
                          <label className="optimized-import-search">
                            <Search size={13} />
                            <input
                              value={optimizedSearch}
                              onChange={(event) => {
                                setOptimizedSearch(event.target.value);
                                setOptimizedVisibleCount(30);
                              }}
                              placeholder="搜索优化问题"
                              aria-label="搜索优化问题"
                            />
                          </label>
                          <div
                            className="optimized-import-list"
                            role="group"
                            aria-label="可选优化问题"
                          >
                            {visibleOptimizedQuestions.length ? (
                              visibleOptimizedQuestions.map((item) => (
                                <label
                                  key={item.id}
                                  className={`optimized-import-item ${optimizedSelected.includes(item.id) ? "checked" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={optimizedSelected.includes(
                                      item.id,
                                    )}
                                    onChange={() =>
                                      toggleOptimizedQuestion(item.id)
                                    }
                                    aria-label={item.question}
                                  />
                                  <span>{item.question}</span>
                                </label>
                              ))
                            ) : (
                              <p className="optimized-import-empty">
                                没有匹配的优化问题。
                              </p>
                            )}
                          </div>
                          {filteredOptimizedQuestions.length >
                            optimizedVisibleCount && (
                            <button
                              type="button"
                              className="optimized-import-more"
                              onClick={() =>
                                setOptimizedVisibleCount((count) => count + 30)
                              }
                            >
                              显示更多（剩余{" "}
                              {filteredOptimizedQuestions.length -
                                optimizedVisibleCount}{" "}
                              条）
                            </button>
                          )}
                          <div className="question-import-footer">
                            <span className="optimized-import-count">
                              已选 {optimizedSelected.length} 条
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setOptimizedImportOpen(false);
                                setOptimizedSelected([]);
                              }}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              className="question-import-confirm"
                              disabled={!optimizedSelected.length}
                              onClick={confirmOptimizedImport}
                            >
                              添加所选
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    className="question-import-control"
                    ref={questionImportControl}
                  >
                    <input
                      ref={questionFileInput}
                      type="file"
                      accept=".txt,text/plain"
                      aria-label="选择 TXT 问题文件"
                      hidden
                      tabIndex={-1}
                      onChange={(event) => {
                        void importQuestionFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <button
                      ref={questionImportButton}
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={questionImportOpen}
                      aria-controls={
                        questionImportOpen
                          ? "monitor-question-import"
                          : undefined
                      }
                      onClick={() => {
                        setQuestionImportOpen((open) => !open);
                        setQuestionImportError("");
                      }}
                    >
                      <FileUp size={12} />
                      导入问题
                    </button>
                    {questionImportOpen && (
                      <div
                        className="question-import-popover"
                        id="monitor-question-import"
                        role="dialog"
                        aria-labelledby={questionImportTitleId}
                        aria-describedby={questionImportHelpId}
                      >
                        <div className="question-import-heading">
                          <strong id={questionImportTitleId}>导入问题</strong>
                          <span id={questionImportHelpId}>
                            每行一个问题，确认后追加到当前列表
                          </span>
                        </div>
                        <textarea
                          ref={questionImportTextarea}
                          aria-label="粘贴问题，每行一个"
                          value={questionImportDraft}
                          onChange={(event) => {
                            setQuestionImportDraft(event.target.value);
                            setQuestionImportError("");
                          }}
                          rows={7}
                          maxLength={200_000}
                          placeholder={"问题一\n问题二\n问题三"}
                        />
                        {questionImportError && (
                          <small className="question-import-error" role="alert">
                            {questionImportError}
                          </small>
                        )}
                        <div className="question-import-footer">
                          <button
                            type="button"
                            className="question-import-file-button"
                            onClick={() => questionFileInput.current?.click()}
                          >
                            <FileUp size={12} />
                            选择 TXT
                          </button>
                          <span />
                          <button
                            type="button"
                            onClick={() => {
                              setQuestionImportOpen(false);
                              setQuestionImportDraft("");
                              setQuestionImportError("");
                              questionImportButton.current?.focus();
                            }}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="question-import-confirm"
                            onClick={() => {
                              if (!importQuestions(questionImportDraft)) return;
                              setQuestionImportOpen(false);
                              setQuestionImportDraft("");
                              questionImportButton.current?.focus();
                            }}
                          >
                            确认导入
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={questionMode === "batch" ? "active" : ""}
                    aria-pressed={questionMode === "batch"}
                    onClick={() =>
                      setQuestionMode((mode) =>
                        mode === "list" ? "batch" : "list",
                      )
                    }
                  >
                    <ListPlus size={12} />
                    {questionMode === "batch" ? "逐条编辑" : "批量粘贴"}
                  </button>
                  <span
                    className={
                      normalized.questions.length > 50
                        ? "counter over"
                        : "counter"
                    }
                  >
                    {normalized.questions.length}/50
                  </span>
                </div>
              </div>
              {questionMode === "batch" ? (
                <>
                  <textarea
                    className="question-batch-editor"
                    aria-label="监控问题，一行一个"
                    aria-describedby={
                      questionsInvalid
                        ? `monitor-question-help ${errorId}`
                        : "monitor-question-help"
                    }
                    aria-invalid={questionsInvalid || undefined}
                    value={questionText}
                    onChange={(event) => setQuestionText(event.target.value)}
                    rows={13}
                    placeholder={
                      "一行一个问题，例如：\n企业选择 GEO 服务商时应该关注哪些能力？\nFrontMind 在 AI 搜索品牌增长方面有哪些优势？"
                    }
                  />
                  {normalized.questions.length > 0 && (
                    <div className="monitor-batch-categories">
                      {normalized.questions.map((question, index) => (
                        <label key={question}>
                          <span>
                            {index + 1}. {question}
                          </span>
                          <select
                            aria-label={`批量问题 ${index + 1} 分类`}
                            value={questionCategories[question] || ""}
                            onChange={(event) => {
                              const category = keywordCategoryKey(
                                event.target.value,
                              );
                              if (category)
                                setQuestionCategories((current) => ({
                                  ...current,
                                  [question]: category,
                                }));
                            }}
                          >
                            <option value="" disabled>
                              选择分类
                            </option>
                            {KEYWORD_CATEGORY_OPTIONS.map((category) => (
                              <option key={category.key} value={category.key}>
                                {category.label.replace(/词$/, "问题")}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="question-list-mode">
                  <div className="question-add-row">
                    <textarea
                      aria-label="新增监控问题"
                      aria-describedby={
                        questionsInvalid
                          ? `monitor-question-help ${errorId}`
                          : "monitor-question-help"
                      }
                      aria-invalid={questionsInvalid || undefined}
                      value={questionDraft}
                      onChange={(event) => setQuestionDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === "Enter"
                        ) {
                          event.preventDefault();
                          addQuestion();
                        }
                      }}
                      rows={2}
                      maxLength={4_000}
                      placeholder="输入问题；可一次粘贴多行，⌘/Ctrl + Enter 添加"
                    />
                    <button
                      type="button"
                      className="question-add-button"
                      disabled={
                        !questionDraft.trim() ||
                        normalized.questions.length >= 50
                      }
                      onClick={addQuestion}
                    >
                      <Plus size={13} />
                      添加问题
                    </button>
                  </div>
                  <div className="question-item-list">
                    {normalized.questions.length ? (
                      normalized.questions.map((question, index) => (
                        <div
                          className={`question-item ${editingQuestionIndex === index ? "editing" : ""}`}
                          key={`${question}-${index}`}
                        >
                          <span className="question-item-index">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {editingQuestionIndex === index ? (
                            <input
                              ref={editingQuestionInput}
                              className="question-item-editor"
                              aria-label={`编辑问题 ${index + 1}`}
                              value={editingQuestionDraft}
                              maxLength={4_000}
                              onChange={(event) =>
                                setEditingQuestionDraft(event.target.value)
                              }
                              onBlur={() => saveQuestionEdit(index)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  saveQuestionEdit(index);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelQuestionEdit();
                                }
                              }}
                            />
                          ) : (
                            <span
                              className="question-item-text"
                              title="双击编辑"
                              onDoubleClick={() =>
                                beginQuestionEdit(index, question)
                              }
                            >
                              {question}
                            </span>
                          )}
                          <select
                            className="monitor-question-category"
                            aria-label={`问题 ${index + 1} 分类`}
                            value={questionCategories[question] || ""}
                            onChange={(event) => {
                              const category = keywordCategoryKey(
                                event.target.value,
                              );
                              if (category)
                                setQuestionCategories((current) => ({
                                  ...current,
                                  [question]: category,
                                }));
                            }}
                          >
                            <option value="" disabled>
                              选择分类
                            </option>
                            {KEYWORD_CATEGORY_OPTIONS.map((category) => (
                              <option key={category.key} value={category.key}>
                                {category.label.replace(/词$/, "问题")}
                              </option>
                            ))}
                          </select>
                          <div className="question-item-actions">
                            {editingQuestionIndex === index ? (
                              <>
                                <button
                                  type="button"
                                  onPointerDown={(event) =>
                                    event.preventDefault()
                                  }
                                  onClick={() => saveQuestionEdit(index)}
                                  aria-label={`保存问题 ${index + 1}`}
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  type="button"
                                  onPointerDown={(event) =>
                                    event.preventDefault()
                                  }
                                  onClick={cancelQuestionEdit}
                                  aria-label={`取消编辑问题 ${index + 1}`}
                                >
                                  <X size={13} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  beginQuestionEdit(index, question)
                                }
                                aria-label={`编辑问题 ${index + 1}`}
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              onPointerDown={(event) => {
                                if (editingQuestionIndex === index)
                                  event.preventDefault();
                              }}
                              onClick={() => removeQuestion(index)}
                              aria-label={`删除问题 ${index + 1}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="question-list-empty">
                        <ListPlus size={23} />
                        <strong>添加第一个问题</strong>
                        <span>问题会按模型与重复次数独立执行并留档。</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {normalized.removed > 0 && (
                <small className="dedupe-hint">
                  已自动移除 {normalized.removed} 条重复问题
                </small>
              )}
            </section>
          </div>
        </div>

        <div className="monitor-form-right">
          <section
            className="form-section models-section"
            aria-invalid={modelsInvalid || undefined}
            aria-describedby={modelsInvalid ? errorId : undefined}
          >
            <div className="section-heading models-heading">
              <div>
                <div className="model-section-title">
                  <h3>
                    模型选择 <b aria-hidden="true">*</b>
                    <span className="sr-only">（必填）</span>
                  </h3>
                  <span className="model-selection-count">
                    已选 {selectedModels.length} 个
                  </span>
                </div>
                <p>选择监控平台，可分别设置深度思考和截图。</p>
              </div>
              <div
                className="model-toolbar"
                role="group"
                aria-label="模型批量设置"
              >
                <button
                  type="button"
                  className={`model-toolbar-toggle ${allAvailableModelsSelected ? "active" : ""}`}
                  aria-label="全部模型"
                  aria-pressed={allAvailableModelsSelected}
                  disabled={!availableModels.length}
                  onClick={toggleAllAvailableModels}
                >
                  <i aria-hidden="true">
                    {allAvailableModelsSelected ? <Check size={11} /> : null}
                  </i>
                  全部模型
                </button>
                <button
                  type="button"
                  className={`model-toolbar-toggle reasoning-toggle ${allSelectedReasoningEnabled ? "active" : ""}`}
                  aria-label={
                    allSelectedReasoningEnabled
                      ? "批量关闭深度思考"
                      : "批量开启深度思考"
                  }
                  aria-pressed={allSelectedReasoningEnabled}
                  disabled={!selectedReasoningModels.length}
                  onClick={toggleReasoningForSelectedModels}
                >
                  <i aria-hidden="true">
                    {allSelectedReasoningEnabled ? <Check size={11} /> : null}
                  </i>
                  深度思考
                </button>
                <div className="screenshot-toolbar">
                  <span>批量截图</span>
                  <div className="segmented-control compact">
                    {(
                      [
                        [0, "不截图"],
                        [2, "提及品牌时"],
                        [1, "全部截图"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={bulkScreenshot === value ? "active" : ""}
                        aria-pressed={bulkScreenshot === value}
                        disabled={
                          !selectedModels.some((model) =>
                            supportsScreenshotPolicy(model, value),
                          )
                        }
                        onClick={() => setScreenshotForSelectedModels(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="model-grid">
              {models.length === 0 && (
                <div className="compact-empty">
                  暂无可用模型。请联系管理员完成官方模型同步。
                </div>
              )}
              {models.map((model) => {
                const active = Boolean(selected[model.id]);
                const support = modelReasoningSupport(model);
                const reasoningEnabled = Boolean(reasoning[model.id]);
                const invalidReasoning =
                  active && reasoningEnabled && support !== "supported";
                const accessibleName = modelAccessibleName(model);
                const screenshot =
                  screenshots[model.id] ?? defaultScreenshotPolicy(model);
                const screenshotLabel = screenshotOptions.find(
                  ([policy]) => policy === screenshot,
                )![1];
                return (
                  <article
                    key={model.id}
                    data-model-code={model.code}
                    className={`model-card ${active ? "selected" : ""} ${invalidReasoning ? "model-reasoning-invalid" : ""}`}
                  >
                    <button
                      type="button"
                      className="model-select"
                      onClick={() =>
                        setSelected((value) => ({
                          ...value,
                          [model.id]: !value[model.id],
                        }))
                      }
                      aria-label={`${modelDisplayName(model)} ${model.clientType === "web" ? "网页版" : "手机版"}`}
                      aria-pressed={active}
                    >
                      <ModelBrandIcon code={model.code} name={model.name} />
                      <strong title={model.name}>
                        {modelDisplayName(model)}
                      </strong>
                      <span className={`client-badge ${model.clientType}`}>
                        {model.clientType === "web" ? "网页版" : "手机版"}
                      </span>
                      <i aria-hidden="true">
                        {active ? <Check size={12} /> : null}
                      </i>
                    </button>
                    <div className="model-platform-settings">
                      <div className="model-capability">
                        <span>思考</span>
                        {support === "supported" || reasoningEnabled ? (
                          <button
                            type="button"
                            role="switch"
                            className="model-reasoning-switch"
                            data-state={
                              reasoningEnabled ? "checked" : "unchecked"
                            }
                            disabled={!active}
                            aria-label={`${accessibleName}深度思考`}
                            aria-checked={reasoningEnabled}
                            aria-describedby={
                              invalidReasoning
                                ? `${errorId}-${model.id}`
                                : undefined
                            }
                            title={
                              reasoningEnabled ? "关闭深度思考" : "开启深度思考"
                            }
                            onClick={() =>
                              setReasoning((value) => ({
                                ...value,
                                [model.id]: !value[model.id],
                              }))
                            }
                          >
                            <i aria-hidden="true" />
                          </button>
                        ) : (
                          <small className="model-reasoning-status">
                            {support === "unsupported"
                              ? "暂不支持"
                              : "能力待确认"}
                          </small>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="model-screenshot-trigger"
                            data-policy={screenshot}
                            disabled={!active}
                            aria-label={`${accessibleName}截图策略：${screenshotLabel}`}
                            title={`截图：${screenshotLabel}`}
                          >
                            {screenshot === 0 ? (
                              <CameraOff size={15} />
                            ) : (
                              <Camera size={15} />
                            )}
                            <ChevronDown size={10} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="monitor-screenshot-menu"
                          collisionPadding={16}
                        >
                          <DropdownMenuRadioGroup
                            value={String(screenshot)}
                            aria-label={`${accessibleName}截图策略`}
                            onValueChange={(next) =>
                              setScreenshots((value) => ({
                                ...value,
                                [model.id]: Number(next) as ScreenshotPolicy,
                              }))
                            }
                          >
                            {screenshotOptions.map(([policy, label]) => (
                              <DropdownMenuRadioItem
                                key={policy}
                                value={String(policy)}
                                disabled={
                                  !supportsScreenshotPolicy(model, policy)
                                }
                              >
                                {label}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {invalidReasoning && (
                      <small
                        className="model-reasoning-warning"
                        id={`${errorId}-${model.id}`}
                      >
                        {support === "unsupported"
                          ? "暂不支持深度思考"
                          : "深度思考能力待确认"}
                        ，请关闭或取消选择。
                      </small>
                    )}
                  </article>
                );
              })}
            </div>
            {unsupportedScreenshotCount > 0 && (
              <small className="capability-warning">
                {unsupportedScreenshotCount}{" "}
                个平台不支持截图，逐平台配置固定为“不截图”。
              </small>
            )}
          </section>

          <section className="form-section monitor-frequency-section">
            <div className="section-heading frequency-heading">
              <div>
                <h3>监控频次</h3>
                <p>设置后续自动执行节奏；暂停不会终止已运行任务。</p>
              </div>
              <div
                className="schedule-status-toggle"
                role="group"
                aria-label="自动监控状态"
              >
                <button
                  type="button"
                  className={scheduleType !== "none" ? "active" : ""}
                  aria-pressed={scheduleType !== "none"}
                  onClick={() => setScheduleEnabled(true)}
                >
                  开启
                </button>
                <button
                  type="button"
                  className={scheduleType === "none" ? "active" : ""}
                  aria-pressed={scheduleType === "none"}
                  onClick={() => setScheduleEnabled(false)}
                >
                  暂停
                </button>
              </div>
            </div>
            <div className="frequency-grid">
              <label className="field">
                <span className="field-label">自动监控</span>
                <select
                  aria-label="执行频率"
                  value={
                    scheduleType === "none" ? scheduleFrequency : scheduleType
                  }
                  disabled={scheduleType === "none"}
                  onChange={(event) => {
                    const value = event.target.value as Exclude<
                      ScheduleType,
                      "none"
                    >;
                    setScheduleFrequency(value);
                    setScheduleType(value);
                  }}
                >
                  <option value="daily">每日</option>
                  <option value="weekly">每周</option>
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
              {scheduleType === "weekly" && (
                <label className="field">
                  <span className="field-label">星期</span>
                  <select
                    aria-label="执行星期"
                    value={weekday}
                    onChange={(event) => setWeekday(Number(event.target.value))}
                  >
                    {weekdays.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </label>
              )}
              <label className="field repetition-field">
                <span className="field-label">
                  提问次数 <b aria-hidden="true">*</b>
                </span>
                <span className="number-input">
                  <input
                    aria-label="重复次数"
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={repetitions}
                    onChange={(event) =>
                      setRepetitions(
                        Math.max(
                          1,
                          Math.min(10, Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                  <span className="number-input-suffix">次 / 平台</span>
                </span>
              </label>
            </div>
          </section>

          <div className="monitor-bottom-grid">
            <section className="form-section location-section">
              <div className="section-heading">
                <div>
                  <h3>地区</h3>
                  <p>
                    为国内与海外网页版模型分别选择执行地区；手机版使用默认地区。
                  </p>
                </div>
                <CircleHelp size={15} />
              </div>
              <div className="location-grid">
                {domesticWebModels.length > 0 && (
                  <label className="field">
                    <span className="field-label">
                      <Globe2 size={14} />
                      国内网页版
                    </span>
                    <select
                      aria-label="批量设置国内网页版位置"
                      value={domesticRegion}
                      onChange={(event) =>
                        setRegionForModels(
                          domesticWebModels,
                          event.target.value,
                        )
                      }
                    >
                      {domesticRegion === mixedRegionValue && (
                        <option value={mixedRegionValue} disabled>
                          多个位置
                        </option>
                      )}
                      <option value="">默认地区</option>
                      {regions
                        .filter((region) => region.scope === "domestic")
                        .map((region) => (
                          <option key={region.code} value={region.code}>
                            {region.name}
                          </option>
                        ))}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                )}
                {overseasWebModels.length > 0 && (
                  <label className="field">
                    <span className="field-label">
                      <MonitorSmartphone size={14} />
                      海外网页版
                    </span>
                    <select
                      aria-label="批量设置海外网页版位置"
                      value={overseasRegion}
                      onChange={(event) =>
                        setRegionForModels(
                          overseasWebModels,
                          event.target.value,
                        )
                      }
                    >
                      {overseasRegion === mixedRegionValue && (
                        <option value={mixedRegionValue} disabled>
                          多个位置
                        </option>
                      )}
                      <option value="">默认地区</option>
                      {regions
                        .filter((region) => region.scope === "overseas")
                        .map((region) => (
                          <option key={region.code} value={region.code}>
                            {region.name}
                          </option>
                        ))}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                )}
                {hasMobile && (
                  <div className="mobile-location-note">
                    <Smartphone size={15} />
                    手机版使用默认地区。
                  </div>
                )}
                {!selectedModels.length && (
                  <div className="compact-empty">
                    选择模型后显示适用的位置选项。
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {error && (
        <p className="form-error monitor-form-error" id={errorId} role="alert">
          {error}
        </p>
      )}
      <footer className="monitor-form-footer">
        <div className="monitor-save-summary" aria-live="polite">
          <div className="attempt-estimate">
            <span>最大预计费用</span>
            <strong
              className={attemptCount > 500 || balanceShortfall ? "over" : ""}
            >
              {quoteLoading
                ? "估算中…"
                : currentQuote
                  ? formatRunMoney(currentQuote.totalAmountTenThousandths)
                  : "—"}
            </strong>
            <small>
              {normalized.questions.length} 个问题 × {selectedModels.length}{" "}
              个平台 × {repetitions} 次 = {attemptCount.toLocaleString("zh-CN")}{" "}
              个采集任务
            </small>
          </div>
          <div className="monitor-save-consequence">
            <span>
              {scheduleType === "none"
                ? "仅保存配置，不自动执行"
                : scheduleType === "weekly"
                  ? `保存后每周${weekdays[weekday - 1]} ${localTime} 自动执行`
                  : `保存后每日 ${localTime} 自动执行`}
            </span>
            <small>
              {attemptCount <= 0
                ? "完善问题和模型后估算费用"
                : attemptCount > 500
                  ? "超过单次 500 个任务上限，请减少问题、模型或次数"
                  : invalidReasoningModels.length
                    ? "请关闭不可用平台的深度思考或取消选择"
                    : quoteLoading
                      ? "正在按FrontMind 资费估算"
                      : quoteError || !currentQuote
                        ? "费用暂无法估算，仍可保存配置"
                        : balanceShortfall
                          ? `余额不足，还差 ${formatRunMoney(balanceShortfall)}，仍可保存配置`
                          : "按实际成功任务结算"}
            </small>
          </div>
        </div>
        <div className="footer-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button
            type="submit"
            className="secondary-strong-button"
            disabled={submitting}
          >
            保存监控
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={submitting || !canRun}
            aria-label={submitting ? "正在保存…" : "保存并立即执行"}
            onClick={() => void validateAndSubmit(true)}
          >
            {submitting ? (
              "正在保存…"
            ) : (
              <>
                <span className="run-now-label-full" aria-hidden="true">
                  保存并立即执行
                </span>
                <span className="run-now-label-compact" aria-hidden="true">
                  保存并执行
                </span>
              </>
            )}
          </button>
        </div>
      </footer>
    </form>
  );
}
