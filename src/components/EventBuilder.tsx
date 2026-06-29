"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { EventFormData, Reminder, REMINDER_OPTIONS } from "@/types/event";
import { TIMEZONES, detectUserTimezone } from "@/lib/timezones";
import { summarizeRecurrence, summarizeReminders } from "@/lib/event-format";
import { parseICSContent } from "@/lib/ics-import";
import { formatDisplayDateTime } from "@/lib/time";
import { BRAND } from "@/lib/brand";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/Dialog";
import { Switch } from "@/components/ui/Switch";
import { Segmented } from "@/components/ui/Segmented";
import { useAppearance } from "@/hooks/useAppearance";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Clock,
  Plus,
  X,
  Image as ImageIcon,
  Link2,
  FileText,
  Settings,
  ChevronDown,
  ChevronRight,
  Download,
  CalendarDays,
  User,
  CheckCircle2,
  Mail,
  Sparkles,
  Loader2,
  Bell,
  Repeat,
  Copy,
  Monitor,
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";

const DAYS_OF_WEEK = [
  { label: "M", value: "MO", full: "Monday" },
  { label: "T", value: "TU", full: "Tuesday" },
  { label: "W", value: "WE", full: "Wednesday" },
  { label: "T", value: "TH", full: "Thursday" },
  { label: "F", value: "FR", full: "Friday" },
  { label: "S", value: "SA", full: "Saturday" },
  { label: "S", value: "SU", full: "Sunday" },
];

const NTH_OPTIONS = [
  { label: "First", value: 1 },
  { label: "Second", value: 2 },
  { label: "Third", value: 3 },
  { label: "Fourth", value: 4 },
  { label: "Last", value: -1 },
];

const STANDARD_REMINDER_PRESET = [60, 1440];

const DEFAULTS_KEY = "cue_defaults";
const TEMPLATES_KEY = "cue_templates";

type InsightSource = "manual" | "ai" | "import" | "template";

type InsightField =
  | "title"
  | "description"
  | "location"
  | "url"
  | "notes"
  | "organizer"
  | "organizerEmail"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "allDay"
  | "timezone"
  | "reminders"
  | "recurrence"
  | "exdates";

interface EventInsight {
  source: InsightSource;
  highlightedFields: InsightField[];
  lowConfidenceFields: InsightField[];
  confidenceByField: Partial<Record<InsightField, number>>;
  timezoneWarning?: string;
  overallConfidence?: number;
}

interface EventTemplate {
  id: string;
  name: string;
  title: string;
  location: string;
  timezone: string;
  reminders: number[];
}

interface ApplyMetadata {
  source: InsightSource;
  confidenceByField?: Partial<Record<InsightField, number>>;
  lowConfidenceFields?: InsightField[];
  timezoneWarning?: string;
  overallConfidence?: number;
}

interface ExtractedAIEvent {
  title?: string;
  description?: string;
  location?: string;
  url?: string;
  organizer?: string;
  organizerEmail?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  allDay?: boolean;
  timezone?: string;
  recurrence?: EventFormData["recurrence"];
  reminders?: Array<{ minutes?: number }>;
  confidence?: {
    overall?: number;
    fields?: Record<string, number>;
    needsReview?: string[];
    notes?: string[];
    timezoneWarning?: string;
  };
}

const fieldStyles =
  "w-full rounded-2xl border border-[var(--field-border)] bg-[var(--field)] px-4 py-3 text-[15px] text-[var(--text)] placeholder:text-[var(--text-tertiary)] transition focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 disabled:opacity-50";
const labelStyles = "mb-1.5 block text-[13px] font-medium text-[var(--text-secondary)]";
const cardStyles =
  "rounded-4xl border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow)]";
const ghostButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)] active:scale-[0.98] disabled:opacity-50";

function getDefaultDates() {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { startDate: fmt(now), startTime: fmtTime(now), endDate: fmt(later), endTime: fmtTime(later) };
}

function buildBlankInsight(): EventInsight {
  return { source: "manual", highlightedFields: [], lowConfidenceFields: [], confidenceByField: {} };
}

function makeReminder(minutes: number): Reminder {
  return { id: Math.random().toString(36).slice(2), minutes };
}

function createDefaultEvent(
  defaultTimezone?: string,
  defaultReminderMinutes: number[] = [],
  defaultLocation?: string,
): EventFormData {
  const dates = getDefaultDates();
  return {
    title: "",
    description: "",
    location: defaultLocation || "",
    url: "",
    notes: "",
    organizer: "",
    organizerEmail: "",
    startDate: dates.startDate,
    startTime: dates.startTime,
    endDate: dates.endDate,
    endTime: dates.endTime,
    allDay: false,
    timezone: defaultTimezone || detectUserTimezone() || "America/New_York",
    reminders: defaultReminderMinutes.map(makeReminder),
    recurrence: { freq: "", interval: 1, byDay: [] },
    exdates: [],
  };
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 60) || "event";
}

function normalizeAIEvent(input: ExtractedAIEvent): Partial<EventFormData> {
  const partial: Partial<EventFormData> = {};
  if (input.title) partial.title = input.title;
  if (input.description) partial.description = input.description;
  if (input.location) partial.location = input.location;
  if (input.url) partial.url = input.url;
  if (input.organizer) partial.organizer = input.organizer;
  if (input.organizerEmail) partial.organizerEmail = input.organizerEmail;
  if (input.startDate) partial.startDate = input.startDate;
  if (input.startTime) partial.startTime = input.startTime;
  if (input.endDate) partial.endDate = input.endDate;
  if (input.endTime) partial.endTime = input.endTime;
  if (input.timezone) partial.timezone = input.timezone;
  if (input.allDay === true) partial.allDay = true;

  if (input.recurrence?.freq) {
    partial.recurrence = {
      freq: input.recurrence.freq,
      interval: input.recurrence.interval || 1,
      byDay: input.recurrence.byDay || [],
      byMonthDay: input.recurrence.byMonthDay || undefined,
      bySetPos: input.recurrence.bySetPos || undefined,
      count: input.recurrence.count || undefined,
      until: input.recurrence.until || undefined,
    };
  }

  if (Array.isArray(input.reminders) && input.reminders.length > 0) {
    partial.reminders = input.reminders.map((reminder) => makeReminder(reminder.minutes || 15));
  }

  return partial;
}

function buildEventFromPartial(
  partial: Partial<EventFormData>,
  defaultTimezone?: string,
  defaultReminderMinutes: number[] = [],
  defaultLocation?: string,
): EventFormData {
  const base = createDefaultEvent(defaultTimezone, defaultReminderMinutes, defaultLocation);
  return {
    ...base,
    ...partial,
    reminders:
      partial.reminders && partial.reminders.length > 0
        ? partial.reminders.map((reminder) => ({
            id: reminder.id || Math.random().toString(36).slice(2),
            minutes: reminder.minutes,
          }))
        : base.reminders,
    recurrence: { ...base.recurrence, ...(partial.recurrence || {}) },
    exdates: partial.exdates || [],
  };
}

function confidenceTone(value?: number): string {
  if (typeof value !== "number") return "text-[var(--text-tertiary)]";
  if (value >= 0.85) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 0.66) return "text-amber-600 dark:text-amber-400";
  return "text-rose-500 dark:text-rose-400";
}

/** Ensures the active value always has a matching <option>, even device zones not in the curated list. */
function timezoneOptionsFor(value: string) {
  if (!value || TIMEZONES.some((zone) => zone.value === value)) return TIMEZONES;
  return [{ label: value.replace(/_/g, " "), value }, ...TIMEZONES];
}

export default function EventBuilder() {
  const [events, setEvents] = useState<EventFormData[]>([createDefaultEvent()]);
  const [eventInsights, setEventInsights] = useState<EventInsight[]>([buildBlankInsight()]);
  const [editedFields, setEditedFields] = useState<Array<Record<string, boolean>>>([{}]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAdvancedRecurrence, setShowAdvancedRecurrence] = useState(false);
  const [newExdate, setNewExdate] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [defaultReminders, setDefaultReminders] = useState<number[]>([]);
  const [defaultTimezone, setDefaultTimezone] = useState<string>("");
  const [defaultLocation, setDefaultLocation] = useState<string>("");
  const [appearance, setAppearance] = useAppearance();

  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [showTemplatePrompt, setShowTemplatePrompt] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState({ percent: 0, label: "" });
  const [aiText, setAiText] = useState("");
  const [aiFiles, setAiFiles] = useState<File[]>([]);

  const [lastExport, setLastExport] = useState<{ filename: string; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const form = events[activeIndex] || events[0];
  const insight = eventInsights[activeIndex] || buildBlankInsight();
  const deviceTimezone = detectUserTimezone();

  useEffect(() => {
    const savedDefaults = localStorage.getItem(DEFAULTS_KEY);
    const detectedTimezone = deviceTimezone;
    if (savedDefaults) {
      try {
        const parsed = JSON.parse(savedDefaults);
        const reminders = Array.isArray(parsed.reminders) ? parsed.reminders : STANDARD_REMINDER_PRESET;
        const timezone = typeof parsed.timezone === "string" && parsed.timezone ? parsed.timezone : detectedTimezone;
        const location = typeof parsed.location === "string" ? parsed.location : "";
        setDefaultReminders(reminders);
        setDefaultTimezone(timezone);
        setDefaultLocation(location);
        setEvents((prev) =>
          prev.map((event) => ({
            ...event,
            timezone: timezone || event.timezone,
            location: event.location || location,
            reminders: reminders.map((minutes: number) => makeReminder(minutes)),
          })),
        );
        return;
      } catch {
        // fall through to defaults
      }
    }
    setDefaultReminders(STANDARD_REMINDER_PRESET);
    setDefaultTimezone(detectedTimezone);
    setEvents((prev) =>
      prev.map((event) => ({
        ...event,
        timezone: event.timezone || detectedTimezone,
        reminders: STANDARD_REMINDER_PRESET.map(makeReminder),
      })),
    );
  }, [deviceTimezone]);

  useEffect(() => {
    const savedTemplates = localStorage.getItem(TEMPLATES_KEY);
    if (!savedTemplates) return;
    try {
      const parsed = JSON.parse(savedTemplates);
      if (Array.isArray(parsed)) {
        setTemplates(parsed.filter((template) => template && template.id && template.name));
      }
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (!aiLoading) {
      setAiProgress({ percent: 0, label: "" });
      return;
    }
    const phases = [
      "Reading your text and images…",
      "Pulling out the event details…",
      "Working out the date, time, and time zone…",
      "Checking everything over…",
    ];
    let tick = 0;
    setAiProgress({ percent: 12, label: phases[0] });
    const timer = setInterval(() => {
      tick += 1;
      const phaseIndex = Math.min(phases.length - 1, Math.floor(tick / 3));
      const percent = Math.min(94, 12 + tick * 6);
      setAiProgress({ percent, label: phases[phaseIndex] });
    }, 320);
    return () => clearInterval(timer);
  }, [aiLoading]);

  useEffect(() => {
    if (events.length === eventInsights.length && events.length === editedFields.length) return;
    setEventInsights((prev) => {
      const next = [...prev];
      while (next.length < events.length) next.push(buildBlankInsight());
      return next.slice(0, events.length);
    });
    setEditedFields((prev) => {
      const next = [...prev];
      while (next.length < events.length) next.push({});
      return next.slice(0, events.length);
    });
    if (activeIndex > events.length - 1) setActiveIndex(Math.max(0, events.length - 1));
  }, [events.length, eventInsights.length, editedFields.length, activeIndex]);

  const saveDefaults = (
    reminders: number[],
    timezone: string = defaultTimezone,
    location: string = defaultLocation,
  ) => {
    setDefaultReminders(reminders);
    setDefaultTimezone(timezone);
    setDefaultLocation(location);
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ reminders, timezone, location }));
  };

  const saveTemplatesToStorage = (nextTemplates: EventTemplate[]) => {
    setTemplates(nextTemplates);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(nextTemplates));
  };

  const markFieldEdited = useCallback((index: number, field: InsightField) => {
    setEditedFields((prev) => {
      const next = [...prev];
      next[index] = { ...(next[index] || {}), [field]: true };
      return next;
    });
    setEventInsights((prev) => {
      const next = [...prev];
      const curr = next[index] || buildBlankInsight();
      next[index] = {
        ...curr,
        highlightedFields: curr.highlightedFields.filter((item) => item !== field),
        lowConfidenceFields: curr.lowConfidenceFields.filter((item) => item !== field),
      };
      return next;
    });
  }, []);

  const setField = useCallback(
    <K extends keyof EventFormData>(key: K, value: EventFormData[K], options?: { markEdited?: boolean }) => {
      setEvents((prev) => {
        const next = [...prev];
        next[activeIndex] = { ...next[activeIndex], [key]: value };
        return next;
      });
      if (options?.markEdited !== false) markFieldEdited(activeIndex, key as InsightField);
    },
    [activeIndex, markFieldEdited],
  );

  const applyPartialToEvent = useCallback(
    (
      index: number,
      partial: Partial<EventFormData>,
      metadata: ApplyMetadata,
      options?: { force?: boolean },
    ): { applied: InsightField[]; conflicts: InsightField[] } => {
      const incomingFields = (Object.entries(partial) as Array<[InsightField, EventFormData[keyof EventFormData]]>).filter(
        ([, value]) => {
          if (value === undefined || value === null) return false;
          if (typeof value === "string") return value.trim().length > 0;
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === "object") return Object.keys(value).length > 0;
          return true;
        },
      );

      if (incomingFields.length === 0) return { applied: [], conflicts: [] };

      const edited = editedFields[index] || {};
      const current = events[index];
      const conflicts = incomingFields
        .filter(
          ([field, value]) =>
            edited[field] && JSON.stringify(current?.[field as keyof EventFormData]) !== JSON.stringify(value),
        )
        .map(([field]) => field);

      let allowedFields = incomingFields.map(([field]) => field);
      if (conflicts.length > 0 && !options?.force) {
        allowedFields = allowedFields.filter((field) => !conflicts.includes(field));
      }
      if (allowedFields.length === 0) return { applied: [], conflicts };

      setEvents((prev) => {
        const next = [...prev];
        const target = { ...next[index] };
        for (const field of allowedFields) {
          const value = partial[field];
          if (value === undefined) continue;
          (target[field as keyof EventFormData] as unknown) = value;
        }
        next[index] = target;
        return next;
      });

      setEventInsights((prev) => {
        const next = [...prev];
        const curr = next[index] || buildBlankInsight();
        const newLowConfidence = (metadata.lowConfidenceFields || []).filter((field) => allowedFields.includes(field));
        next[index] = {
          ...curr,
          source: metadata.source,
          highlightedFields: Array.from(new Set<InsightField>([...curr.highlightedFields, ...allowedFields])),
          lowConfidenceFields: Array.from(new Set<InsightField>([...curr.lowConfidenceFields, ...newLowConfidence])),
          confidenceByField: { ...curr.confidenceByField, ...(metadata.confidenceByField || {}) },
          timezoneWarning: metadata.timezoneWarning || curr.timezoneWarning,
          overallConfidence: metadata.overallConfidence ?? curr.overallConfidence,
        };
        return next;
      });

      return { applied: allowedFields, conflicts };
    },
    [editedFields, events],
  );

  const appendEvent = useCallback(
    (partial?: Partial<EventFormData>, metadata?: ApplyMetadata) => {
      const newEvent = buildEventFromPartial(
        partial || {},
        defaultTimezone || undefined,
        defaultReminders,
        defaultLocation || undefined,
      );
      const newInsight: EventInsight = {
        ...buildBlankInsight(),
        source: metadata?.source || "manual",
        highlightedFields: Object.keys(partial || {}) as InsightField[],
        lowConfidenceFields: metadata?.lowConfidenceFields || [],
        confidenceByField: metadata?.confidenceByField || {},
        timezoneWarning: metadata?.timezoneWarning,
        overallConfidence: metadata?.overallConfidence,
      };
      setEvents((prev) => [...prev, newEvent]);
      setEditedFields((prev) => [...prev, {}]);
      setEventInsights((prev) => [...prev, newInsight]);
    },
    [defaultTimezone, defaultReminders, defaultLocation],
  );

  const removeEvent = (index: number) => {
    if (events.length === 1) return;
    setEvents((prev) => prev.filter((_, i) => i !== index));
    setEditedFields((prev) => prev.filter((_, i) => i !== index));
    setEventInsights((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((prev) => {
      if (prev === index) return Math.max(0, index - 1);
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  const addReminder = () => setField("reminders", [...form.reminders, makeReminder(15)]);
  const removeReminder = (id: string) =>
    setField("reminders", form.reminders.filter((reminder) => reminder.id !== id));

  const applyReminderPreset = (minutes: number[]) => {
    setField("reminders", minutes.map(makeReminder));
    setEventInsights((prev) => {
      const next = [...prev];
      const curr = next[activeIndex] || buildBlankInsight();
      next[activeIndex] = {
        ...curr,
        highlightedFields: Array.from(new Set<InsightField>([...curr.highlightedFields, "reminders"])),
      };
      return next;
    });
  };

  const setRecurrence = (updater: Partial<EventFormData["recurrence"]>) =>
    setField("recurrence", { ...form.recurrence, ...updater });

  const addExdate = () => {
    if (!newExdate) return;
    if (form.exdates.includes(newExdate)) {
      toast.info("That date is already excluded.");
      return;
    }
    setField("exdates", [...form.exdates, newExdate]);
    setNewExdate("");
  };

  const removeExdate = (value: string) =>
    setField("exdates", form.exdates.filter((item) => item !== value));

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const partial: Partial<EventFormData> = {
      title: template.title,
      location: template.location,
      timezone: template.timezone,
      reminders: template.reminders.map(makeReminder),
    };
    const { applied } = applyPartialToEvent(activeIndex, partial, {
      source: "template",
      confidenceByField: { title: 1, location: 1, timezone: 1, reminders: 1 },
    });
    if (applied.length > 0) toast.success(`Applied “${template.name}”.`);
  };

  const confirmSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    const template: EventTemplate = {
      id: Math.random().toString(36).slice(2),
      name,
      title: form.title,
      location: form.location,
      timezone: form.timezone,
      reminders: form.reminders.map((item) => item.minutes),
    };
    const next = [template, ...templates].slice(0, 20);
    saveTemplatesToStorage(next);
    setSelectedTemplateId(template.id);
    setShowTemplatePrompt(false);
    toast.success("Template saved.");
  };

  const handleAIExtract = async () => {
    if (!aiText && aiFiles.length === 0) return;
    setAiLoading(true);
    try {
      const requestData = new FormData();
      if (aiText) requestData.append("text", aiText);
      aiFiles.forEach((file) => requestData.append("images", file));
      requestData.append("localDate", new Date().toString());
      requestData.append("localTimezone", deviceTimezone);

      const response = await fetch("/api/extract-event", { method: "POST", body: requestData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Couldn’t read that. Try again.");

      const aiEvents: ExtractedAIEvent[] = payload?.data?.events || [];
      if (!Array.isArray(aiEvents) || aiEvents.length === 0) {
        toast.error("No events found in that text or image.");
        return;
      }

      let createdCount = 0;
      const conflictResults: Array<{ partial: Partial<EventFormData>; metadata: ApplyMetadata; conflicts: InsightField[] }> = [];

      aiEvents.forEach((rawEvent, index) => {
        const partial = normalizeAIEvent(rawEvent);
        const confidenceByField: Partial<Record<InsightField, number>> = {};
        if (rawEvent.confidence?.fields) {
          for (const [key, value] of Object.entries(rawEvent.confidence.fields)) {
            confidenceByField[key as InsightField] = value;
          }
        }
        const metadata: ApplyMetadata = {
          source: "ai",
          confidenceByField,
          lowConfidenceFields: (rawEvent.confidence?.needsReview || []) as InsightField[],
          timezoneWarning: rawEvent.confidence?.timezoneWarning,
          overallConfidence: rawEvent.confidence?.overall,
        };
        if (index === 0) {
          const { conflicts } = applyPartialToEvent(activeIndex, partial, metadata);
          if (conflicts.length > 0) conflictResults.push({ partial, metadata, conflicts });
        } else {
          appendEvent(partial, metadata);
          createdCount += 1;
        }
      });

      setAiProgress({ percent: 100, label: "Done" });
      setAiText("");
      setAiFiles([]);

      toast.success(
        createdCount > 0
          ? `Filled this event and added ${createdCount} more.`
          : "Event filled in. Review and export when ready.",
      );

      const pendingConflict = conflictResults[0];
      if (pendingConflict) {
        const { partial, metadata, conflicts } = pendingConflict;
        toast("Kept your manual edits.", {
          description: `${conflicts.join(", ")} weren’t changed.`,
          action: {
            label: "Use AI values",
            onClick: () => applyPartialToEvent(activeIndex, partial, metadata, { force: true }),
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed.";
      if (message.includes("OPENAI_API_KEY")) {
        toast.error("AI import isn’t set up yet.", {
          description: "Add an OpenAI API key to enable it. You can still build events by hand.",
        });
      } else {
        toast.error(message);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleImportICS = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = parseICSContent(content);
      if (parsed.events.length === 0) {
        toast.error(parsed.errors[0] || "No events found in that .ics file.");
        return;
      }
      const fullConfidence: Partial<Record<InsightField, number>> = {
        title: 1,
        description: 1,
        location: 1,
        url: 1,
        startDate: 1,
        startTime: 1,
        endDate: 1,
        endTime: 1,
        timezone: 1,
        reminders: 1,
        recurrence: 1,
      };
      const currentIsMostlyEmpty =
        !form.title &&
        !form.description &&
        !form.location &&
        !form.url &&
        Object.keys(editedFields[activeIndex] || {}).length === 0;

      parsed.events.forEach((partial, idx) => {
        if (idx === 0 && currentIsMostlyEmpty) {
          applyPartialToEvent(activeIndex, partial, { source: "import", confidenceByField: fullConfidence }, { force: true });
        } else {
          appendEvent(partial, { source: "import", confidenceByField: fullConfidence });
        }
      });

      if (parsed.errors.length > 0) {
        toast.warning(`Imported with a note: ${parsed.errors[0]}`);
      } else {
        toast.success(`Imported ${parsed.events.length} event${parsed.events.length === 1 ? "" : "s"}.`);
      }
    } catch {
      toast.error("Couldn’t read that .ics file.");
    } finally {
      event.target.value = "";
    }
  };

  const buildICS = async (items: EventFormData[]): Promise<string> => {
    const response = await fetch("/api/generate-ics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Export failed." }));
      throw new Error(errorBody.error || "Export failed.");
    }
    return response.text();
  };

  const handleSubmit = async () => {
    const invalidIndex = events.findIndex((event) => !event.title?.trim());
    if (invalidIndex !== -1) {
      setActiveIndex(invalidIndex);
      toast.error(events.length > 1 ? `Event ${invalidIndex + 1} needs a title.` : "Add a title to continue.");
      return;
    }
    setLoading(true);
    try {
      const text = await buildICS(events);
      const filename = `${sanitizeFilename(events.length === 1 ? events[0].title || "event" : `${BRAND.name}_events`)}.ics`;
      const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setLastExport({ filename, text });
      toast.success(events.length > 1 ? "Calendar file downloaded." : "Event downloaded.", {
        description: "Open it to add to Apple Calendar.",
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setLoading(false);
    }
  };

  const copyICS = async () => {
    if (!lastExport) return;
    try {
      await navigator.clipboard.writeText(lastExport.text);
      toast.success("Copied .ics to clipboard.");
    } catch {
      toast.error("Couldn’t copy to clipboard.");
    }
  };

  const timezoneHelperText = useMemo(() => {
    if (!form) return "";
    if (form.allDay) return "All-day events show on the date itself, in every time zone.";
    if (!form.timezone) return "Floating time — shows at this clock time wherever the calendar opens.";
    if (!form.startDate || !form.startTime) return "";
    if (form.timezone === deviceTimezone) return "";
    try {
      const converted = formatDisplayDateTime(form.startDate, form.startTime, form.timezone, deviceTimezone);
      return `Shows as ${converted} in your time zone (${deviceTimezone}).`;
    } catch {
      return "Double-check the time zone before exporting.";
    }
  }, [form, deviceTimezone]);

  const previewDateLine = useMemo(() => {
    if (!form) return "";
    if (form.allDay) {
      const start = new Date(`${form.startDate}T00:00:00`);
      const end = new Date(`${form.endDate}T00:00:00`);
      const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
      const startText = start.toLocaleDateString(undefined, opts);
      const endText = end.toLocaleDateString(undefined, opts);
      return startText === endText ? `${startText} · All day` : `${startText} – ${endText} · All day`;
    }
    const tz = form.timezone || deviceTimezone;
    const startText = formatDisplayDateTime(form.startDate, form.startTime, tz, tz);
    const endText = form.timezone
      ? formatDisplayDateTime(form.endDate, form.endTime, tz, tz)
      : formatDisplayDateTime(form.endDate, form.endTime, tz, tz);
    return `${startText} – ${endText}`;
  }, [form, deviceTimezone]);

  const reminderSummary = useMemo(() => summarizeReminders(form?.reminders || []), [form?.reminders]);
  const recurrenceSummary = useMemo(
    () => summarizeRecurrence(form?.recurrence || { freq: "", interval: 1, byDay: [] }),
    [form?.recurrence],
  );

  const getFieldClass = (field: InsightField) => {
    const highlighted = insight.highlightedFields.includes(field);
    const lowConfidence = insight.lowConfidenceFields.includes(field);
    return cn(
      highlighted && "border-accent/50 bg-accent/[0.04]",
      lowConfidence && "border-amber-400/70 bg-amber-50/60 dark:bg-amber-500/10",
    );
  };

  const renderLabel = (label: string, field: InsightField, htmlFor?: string, required = false) => {
    const confidence = insight.confidenceByField[field];
    const lowConfidence = insight.lowConfidenceFields.includes(field);
    return (
      <label className={labelStyles} htmlFor={htmlFor}>
        <span className="inline-flex items-center gap-2">
          {label}
          {required && (
            <span className="text-accent" aria-hidden="true">
              *
            </span>
          )}
          {typeof confidence === "number" && (
            <span className={cn("text-[11px] font-semibold", confidenceTone(confidence))}>
              {Math.round(confidence * 100)}%
            </span>
          )}
          {lowConfidence && (
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Check this</span>
          )}
        </span>
      </label>
    );
  };

  const recurrenceMonthlyMode =
    form?.recurrence.bySetPos && form.recurrence.byDay && form.recurrence.byDay.length === 1 ? "nth" : "monthDay";

  const appearanceIcon = { auto: <Monitor className="h-4 w-4" />, light: <Sun className="h-4 w-4" />, dark: <Moon className="h-4 w-4" /> };

  return (
    <div className="relative min-h-screen px-5 py-8 sm:px-8 sm:py-12">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"
        style={{ background: "radial-gradient(ellipse 80% 100% at 50% -10%, var(--canvas-glow), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <header className="relative flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="absolute right-0 top-0 rounded-full border border-[var(--hairline)] bg-[var(--surface)] p-2.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <Settings className="h-5 w-5" />
          </button>

          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/25">
            <CalendarDays className="h-7 w-7" strokeWidth={2} />
          </div>
          <h1 className="text-[34px] font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-[44px]">{BRAND.name}</h1>
          <p className="mt-2 max-w-md text-[16px] leading-relaxed text-[var(--text-secondary)] sm:text-[17px]">
            {BRAND.tagline}
          </p>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {/* AI capture — the hero action */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className={cn(cardStyles, "p-5 sm:p-6")}
              aria-label="Create with AI"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <Sparkles className="h-5 w-5 text-accent" />
                <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text)]">Start with anything</h2>
              </div>
              <p className="mb-4 text-[14px] text-[var(--text-secondary)]">
                Paste an email, a message, or a flyer — or drop in a screenshot. We’ll fill in the details.
              </p>

              <textarea
                className={cn(fieldStyles, "min-h-[92px] resize-none")}
                placeholder="e.g. Lunch with Sam next Thursday at 12:30 at Blue Bottle, repeats weekly"
                value={aiText}
                onChange={(event) => setAiText(event.target.value)}
                disabled={aiLoading}
                aria-label="Event description for AI"
              />

              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    if (event.target.files) setAiFiles(Array.from(event.target.files));
                  }}
                />
                <input type="file" ref={importInputRef} className="hidden" accept=".ics,text/calendar" onChange={handleImportICS} />

                <button type="button" disabled={aiLoading} onClick={() => fileInputRef.current?.click()} className={cn(ghostButton, "flex-1")}>
                  <ImageIcon className="h-4 w-4" />
                  {aiFiles.length > 0 ? `${aiFiles.length} image${aiFiles.length === 1 ? "" : "s"}` : "Add images"}
                </button>
                <button type="button" onClick={() => importInputRef.current?.click()} className={cn(ghostButton, "flex-1")}>
                  <FileText className="h-4 w-4" />
                  Import .ics
                </button>
                <button
                  type="button"
                  onClick={handleAIExtract}
                  disabled={aiLoading || (!aiText && aiFiles.length === 0)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:opacity-40 sm:flex-[1.4]"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {aiLoading ? "Reading…" : "Create event"}
                </button>
              </div>

              <AnimatePresence>
                {aiLoading && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-2 overflow-hidden">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${aiProgress.percent}%` }} transition={{ ease: "easeOut" }} />
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)]">{aiProgress.label}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>

            {/* Event editor */}
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }} className={cn(cardStyles, "overflow-hidden")}>
              {/* Event tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--hairline)] p-3 no-scrollbar">
                {events.map((event, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    aria-current={activeIndex === idx}
                    className={cn(
                      "whitespace-nowrap rounded-lg px-3.5 py-2 text-[14px] font-medium transition-colors",
                      activeIndex === idx ? "bg-accent text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]",
                    )}
                  >
                    {event.title || `Event ${idx + 1}`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    appendEvent();
                    setActiveIndex(events.length);
                  }}
                  aria-label="Add another event"
                  className="ml-1 flex min-w-[36px] items-center justify-center rounded-lg p-2 text-accent transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {events.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEvent(activeIndex)}
                    aria-label="Remove this event"
                    className="ml-auto flex min-w-[36px] items-center justify-center rounded-lg p-2 text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="space-y-9 p-6 sm:p-8">
                {/* What & where */}
                <section className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[15px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Event details</h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select
                          aria-label="Apply a saved template"
                          className={cn(fieldStyles, "appearance-none py-2 pr-9 text-[13px]")}
                          value={selectedTemplateId}
                          onChange={(event) => applyTemplate(event.target.value)}
                        >
                          <option value="">Templates</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTemplateName(form.title?.trim() || "");
                          setShowTemplatePrompt(true);
                        }}
                        className={cn(ghostButton, "py-2 text-[13px]")}
                      >
                        Save as template
                      </button>
                    </div>
                  </div>

                  <div>
                    {renderLabel("Title", "title", "event-title", true)}
                    <input
                      id="event-title"
                      className={cn(fieldStyles, getFieldClass("title"))}
                      placeholder="Add a title"
                      value={form.title}
                      onChange={(event) => setField("title", event.target.value)}
                    />
                  </div>

                  <div>
                    {renderLabel("Notes", "description", "event-description")}
                    <textarea
                      id="event-description"
                      className={cn(fieldStyles, "h-24 resize-none", getFieldClass("description"))}
                      placeholder="Add details, an agenda, or anything to remember"
                      value={form.description}
                      onChange={(event) => setField("description", event.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div>
                      {renderLabel("Location", "location", "event-location")}
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                        <input
                          id="event-location"
                          className={cn(fieldStyles, "pl-10", getFieldClass("location"))}
                          placeholder="Place or address"
                          value={form.location}
                          onChange={(event) => setField("location", event.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      {renderLabel("Link", "url", "event-url")}
                      <div className="relative">
                        <Link2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                        <input
                          id="event-url"
                          className={cn(fieldStyles, "pl-10", getFieldClass("url"))}
                          placeholder="Video call or event link"
                          value={form.url}
                          onChange={(event) => setField("url", event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <hr className="border-[var(--hairline)]" />

                {/* When */}
                <section className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Date &amp; time</h3>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[14px] font-medium text-[var(--text-secondary)]">All day</span>
                      <Switch checked={form.allDay} onChange={(checked) => setField("allDay", checked)} label="All-day event" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
                    <div className="space-y-5">
                      <div>
                        {renderLabel("Starts", "startDate", "start-date")}
                        <input id="start-date" type="date" className={cn(fieldStyles, getFieldClass("startDate"))} value={form.startDate} onChange={(event) => setField("startDate", event.target.value)} />
                      </div>
                      <AnimatePresence initial={false}>
                        {!form.allDay && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <input aria-label="Start time" type="time" className={cn(fieldStyles, getFieldClass("startTime"))} value={form.startTime} onChange={(event) => setField("startTime", event.target.value)} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="space-y-5">
                      <div>
                        {renderLabel("Ends", "endDate", "end-date")}
                        <input id="end-date" type="date" className={cn(fieldStyles, getFieldClass("endDate"))} value={form.endDate} onChange={(event) => setField("endDate", event.target.value)} />
                      </div>
                      <AnimatePresence initial={false}>
                        {!form.allDay && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <input aria-label="End time" type="time" className={cn(fieldStyles, getFieldClass("endTime"))} value={form.endTime} onChange={(event) => setField("endTime", event.target.value)} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div>
                    {renderLabel("Time zone", "timezone", "event-timezone")}
                    <div className="relative">
                      <select id="event-timezone" className={cn(fieldStyles, "appearance-none pr-10", getFieldClass("timezone"))} value={form.timezone} onChange={(event) => setField("timezone", event.target.value)}>
                        <option value="">Floating (no fixed time zone)</option>
                        {timezoneOptionsFor(form.timezone).map((zone) => (
                          <option key={zone.value} value={zone.value}>
                            {zone.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    </div>
                    {timezoneHelperText && <p className="mt-1.5 text-[12px] text-[var(--text-secondary)]">{timezoneHelperText}</p>}
                    {insight.timezoneWarning && <p className="mt-1 text-[12px] text-amber-600 dark:text-amber-400">{insight.timezoneWarning}</p>}
                  </div>
                </section>

                <hr className="border-[var(--hairline)]" />

                {/* Alerts */}
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[15px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Alerts</h3>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => applyReminderPreset(STANDARD_REMINDER_PRESET)} className={cn(ghostButton, "py-2 text-[13px]")}>
                        1 hr &amp; 1 day
                      </button>
                      <button type="button" onClick={() => setField("reminders", [])} className={cn(ghostButton, "py-2 text-[13px]")}>
                        Clear
                      </button>
                      <button type="button" onClick={addReminder} aria-label="Add an alert" className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-2.5 text-accent transition-colors hover:bg-[var(--surface-muted)]">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {form.reminders.length === 0 ? (
                    <p className="text-[14px] text-[var(--text-tertiary)]">No alerts yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {form.reminders.map((reminder) => (
                        <div key={reminder.id} className="flex items-center gap-2.5">
                          <div className="relative flex-1">
                            <Bell className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                            <select
                              aria-label="Alert timing"
                              className={cn(fieldStyles, "appearance-none py-2.5 pl-10 pr-9")}
                              value={reminder.minutes}
                              onChange={(event) =>
                                setField(
                                  "reminders",
                                  form.reminders.map((item) => (item.id === reminder.id ? { ...item, minutes: parseInt(event.target.value, 10) } : item)),
                                )
                              }
                            >
                              {REMINDER_OPTIONS.map((option) => (
                                <option key={option.minutes} value={option.minutes}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                          </div>
                          <button type="button" onClick={() => removeReminder(reminder.id)} aria-label="Remove alert" className="rounded-xl p-2.5 text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <hr className="border-[var(--hairline)]" />

                {/* More options */}
                <section className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    aria-expanded={showAdvanced}
                    className="flex w-full items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-5 py-4 text-left transition-colors hover:brightness-[0.98]"
                  >
                    <span className="flex items-center gap-3">
                      <Repeat className="h-5 w-5 text-[var(--text-secondary)]" />
                      <span className="text-[15px] font-medium text-[var(--text)]">Repeat, organizer &amp; more</span>
                    </span>
                    <motion.span animate={{ rotate: showAdvanced ? 90 : 0 }} className="text-[var(--text-tertiary)]">
                      <ChevronRight className="h-5 w-5" />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {showAdvanced && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-7 overflow-hidden px-1 pt-1">
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                          <div>
                            {renderLabel("Organizer", "organizer", "event-organizer")}
                            <div className="relative">
                              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                              <input id="event-organizer" className={cn(fieldStyles, "pl-10", getFieldClass("organizer"))} placeholder="Name" value={form.organizer} onChange={(event) => setField("organizer", event.target.value)} />
                            </div>
                          </div>
                          <div>
                            {renderLabel("Organizer email", "organizerEmail", "event-organizer-email")}
                            <div className="relative">
                              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                              <input id="event-organizer-email" type="email" className={cn(fieldStyles, "pl-10", getFieldClass("organizerEmail"))} placeholder="name@email.com" value={form.organizerEmail} onChange={(event) => setField("organizerEmail", event.target.value)} />
                            </div>
                          </div>
                        </div>

                        <div>
                          {renderLabel("Private note", "notes", "event-notes")}
                          <textarea id="event-notes" className={cn(fieldStyles, "h-20 resize-none", getFieldClass("notes"))} placeholder="Saved as a comment inside the file" value={form.notes} onChange={(event) => setField("notes", event.target.value)} />
                        </div>

                        {/* Recurrence */}
                        <div className="space-y-5 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-muted)]/50 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-[15px] font-semibold text-[var(--text)]">Repeat</h4>
                            {form.recurrence.freq && <span className="text-[12px] text-[var(--text-secondary)]">{recurrenceSummary}</span>}
                          </div>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <label className={labelStyles} htmlFor="recur-freq">
                                Frequency
                              </label>
                              <select
                                id="recur-freq"
                                className={cn(fieldStyles, "appearance-none")}
                                value={form.recurrence.freq}
                                onChange={(event) => {
                                  const freq = event.target.value as EventFormData["recurrence"]["freq"];
                                  setRecurrence({ freq, interval: 1, byDay: [], byMonthDay: undefined, bySetPos: undefined, count: undefined, until: undefined });
                                }}
                              >
                                <option value="">Doesn’t repeat</option>
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="YEARLY">Yearly</option>
                              </select>
                            </div>
                            {form.recurrence.freq && (
                              <div>
                                <label className={labelStyles} htmlFor="recur-interval">
                                  Every
                                </label>
                                <input id="recur-interval" type="number" min={1} className={fieldStyles} value={form.recurrence.interval || 1} onChange={(event) => setRecurrence({ interval: Math.max(1, parseInt(event.target.value, 10) || 1) })} />
                              </div>
                            )}
                          </div>

                          {form.recurrence.freq && (
                            <div className="space-y-4">
                              <button type="button" onClick={() => setShowAdvancedRecurrence((prev) => !prev)} aria-expanded={showAdvancedRecurrence} className={cn(ghostButton, "py-2 text-[13px]")}>
                                {showAdvancedRecurrence ? "Hide options" : "More repeat options"}
                              </button>

                              <AnimatePresence initial={false}>
                                {showAdvancedRecurrence && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                    {(form.recurrence.freq === "WEEKLY" || form.recurrence.freq === "MONTHLY") && (
                                      <div>
                                        <span className={labelStyles}>On these days</span>
                                        <div className="flex flex-wrap gap-2">
                                          {DAYS_OF_WEEK.map((day, dayIdx) => {
                                            const selected = (form.recurrence.byDay || []).includes(day.value);
                                            return (
                                              <button
                                                key={`${day.value}-${dayIdx}`}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => {
                                                  const current = form.recurrence.byDay || [];
                                                  const next = current.includes(day.value) ? current.filter((item) => item !== day.value) : [...current, day.value];
                                                  setRecurrence({ byDay: next });
                                                }}
                                                className={cn(
                                                  "h-10 w-10 rounded-full text-[13px] font-semibold transition-colors",
                                                  selected ? "bg-accent text-white" : "bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]",
                                                )}
                                                title={day.full}
                                              >
                                                {day.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {form.recurrence.freq === "MONTHLY" && (
                                      <div className="space-y-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
                                        <Segmented
                                          ariaLabel="Monthly repeat mode"
                                          value={recurrenceMonthlyMode}
                                          onChange={(mode) => {
                                            if (mode === "monthDay") setRecurrence({ bySetPos: undefined, byMonthDay: [new Date(`${form.startDate}T00:00:00`).getDate()] });
                                            else setRecurrence({ bySetPos: 1, byDay: [form.recurrence.byDay?.[0] || "MO"], byMonthDay: undefined });
                                          }}
                                          options={[
                                            { label: "Day of month", value: "monthDay" },
                                            { label: "Nth weekday", value: "nth" },
                                          ]}
                                        />
                                        {recurrenceMonthlyMode === "monthDay" ? (
                                          <div>
                                            <label className={labelStyles} htmlFor="recur-monthday">
                                              Day of month
                                            </label>
                                            <input
                                              id="recur-monthday"
                                              type="number"
                                              min={1}
                                              max={31}
                                              className={fieldStyles}
                                              value={form.recurrence.byMonthDay?.[0] || ""}
                                              onChange={(event) => {
                                                const value = Math.max(1, Math.min(31, parseInt(event.target.value, 10) || 1));
                                                setRecurrence({ byMonthDay: [value], bySetPos: undefined });
                                              }}
                                            />
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-2 gap-3">
                                            <div>
                                              <label className={labelStyles} htmlFor="recur-setpos">
                                                Which
                                              </label>
                                              <select id="recur-setpos" className={cn(fieldStyles, "appearance-none")} value={form.recurrence.bySetPos || 1} onChange={(event) => setRecurrence({ bySetPos: parseInt(event.target.value, 10) || 1 })}>
                                                {NTH_OPTIONS.map((option) => (
                                                  <option key={option.value} value={option.value}>
                                                    {option.label}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <div>
                                              <label className={labelStyles} htmlFor="recur-weekday">
                                                Weekday
                                              </label>
                                              <select id="recur-weekday" className={cn(fieldStyles, "appearance-none")} value={form.recurrence.byDay?.[0] || "MO"} onChange={(event) => setRecurrence({ byDay: [event.target.value], byMonthDay: undefined })}>
                                                {DAYS_OF_WEEK.map((day, dayIdx) => (
                                                  <option key={`${day.value}-opt-${dayIdx}`} value={day.value}>
                                                    {day.full}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                      <div>
                                        <label className={labelStyles} htmlFor="recur-count">
                                          End after (times)
                                        </label>
                                        <input id="recur-count" type="number" min={1} placeholder="Never" className={fieldStyles} value={form.recurrence.count || ""} onChange={(event) => setRecurrence({ count: parseInt(event.target.value, 10) || undefined, until: undefined })} />
                                      </div>
                                      <div>
                                        <label className={labelStyles} htmlFor="recur-until">
                                          Or end on
                                        </label>
                                        <input id="recur-until" type="date" className={fieldStyles} value={form.recurrence.until || ""} onChange={(event) => setRecurrence({ until: event.target.value || undefined, count: undefined })} />
                                      </div>
                                    </div>

                                    <div className="space-y-3">
                                      <span className={labelStyles}>Skip these dates</span>
                                      <div className="flex gap-2">
                                        <input aria-label="Date to skip" type="date" className={fieldStyles} value={newExdate} onChange={(event) => setNewExdate(event.target.value)} />
                                        <button type="button" onClick={addExdate} className={cn(ghostButton, "shrink-0")}>
                                          Add
                                        </button>
                                      </div>
                                      {form.exdates.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                          {form.exdates.map((value) => (
                                            <button key={value} type="button" onClick={() => removeExdate(value)} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1.5 text-[12px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                                              {value}
                                              <X className="h-3.5 w-3.5" />
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              </div>

              {/* Sticky export bar */}
              <div className="sticky bottom-0 z-10 flex flex-col items-center justify-between gap-3 border-t border-[var(--hairline)] bg-[var(--surface)]/85 p-5 backdrop-blur-xl sm:flex-row sm:px-8">
                <p className="text-[13px] text-[var(--text-tertiary)]">Works with Apple Calendar, Google&nbsp;Calendar, and Outlook.</p>
                <button type="button" onClick={handleSubmit} disabled={loading} className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent px-7 py-3.5 text-[15px] font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50 sm:w-auto">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                  {loading ? "Preparing…" : events.length > 1 ? `Download ${events.length} events` : "Add to Calendar"}
                </button>
              </div>
            </motion.section>
          </div>

          {/* Sidebar */}
          <div className="space-y-5 lg:sticky lg:top-8">
            {/* Live event card — the signature preview */}
            <motion.section initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className={cn(cardStyles, "overflow-hidden")} aria-label="Event preview">
              <div className="border-b border-[var(--hairline)] px-5 py-3">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Preview</h3>
              </div>
              <div className="p-5">
                <div className="flex gap-3.5 rounded-2xl bg-[var(--surface-muted)] p-4">
                  <div className="mt-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="truncate text-[16px] font-semibold text-[var(--text)]">{form.title || "Untitled event"}</p>
                    <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{previewDateLine}</span>
                    </p>
                    {form.location && (
                      <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{form.location}</span>
                      </p>
                    )}
                    {form.url && (
                      <p className="flex items-center gap-1.5 text-[13px] text-accent">
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{form.url}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {form.reminders.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                          <Bell className="h-3 w-3" />
                          {reminderSummary}
                        </span>
                      )}
                      {form.recurrence.freq && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                          <Repeat className="h-3 w-3" />
                          {recurrenceSummary}
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-md bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                        {form.timezone || "Floating"}
                      </span>
                    </div>
                  </div>
                </div>

                {lastExport && (
                  <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 px-3.5 py-2.5 dark:bg-emerald-500/10">
                    <span className="flex min-w-0 items-center gap-2 text-[13px] text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">{lastExport.filename}</span>
                    </span>
                    <button type="button" onClick={copyICS} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                  </div>
                )}
              </div>
            </motion.section>

            {/* Event list */}
            {events.length > 1 && (
              <motion.section initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className={cn(cardStyles, "p-5")}>
                <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Events ({events.length})</h3>
                <div className="max-h-[300px] space-y-2 overflow-auto no-scrollbar">
                  {events.map((event, idx) => (
                    <div key={idx} className={cn("flex items-center justify-between gap-2 rounded-xl border p-3 transition-colors", idx === activeIndex ? "border-accent/40 bg-accent/[0.05]" : "border-[var(--hairline)]")}>
                      <button type="button" onClick={() => setActiveIndex(idx)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-[14px] font-medium text-[var(--text)]">{event.title || `Event ${idx + 1}`}</p>
                        <p className="truncate text-[12px] text-[var(--text-tertiary)]">
                          {event.startDate} {event.allDay ? "· All day" : `· ${event.startTime}`}
                        </p>
                      </button>
                      <button type="button" onClick={() => removeEvent(idx)} aria-label={`Remove event ${idx + 1}`} className="shrink-0 rounded-lg p-1.5 text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </div>
        </div>

        <footer className="pb-2 text-center text-[12px] text-[var(--text-tertiary)]">
          {BRAND.name} generates standard .ics calendar files. Everything stays in your browser.
        </footer>
      </div>

      {/* Save-as-template prompt */}
      <Dialog open={showTemplatePrompt} onClose={() => setShowTemplatePrompt(false)} title="Save as template" description="Reuse this event’s title, location, time zone, and alerts later.">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            confirmSaveTemplate();
          }}
        >
          <label className={labelStyles} htmlFor="template-name">
            Template name
          </label>
          <input id="template-name" autoFocus className={fieldStyles} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="e.g. Weekly standup" />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowTemplatePrompt(false)} className={ghostButton}>
              Cancel
            </button>
            <button type="submit" disabled={!templateName.trim()} className="rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-accent-hover disabled:opacity-40">
              Save template
            </button>
          </div>
        </form>
      </Dialog>

      {/* Settings */}
      <Dialog open={showSettings} onClose={() => setShowSettings(false)} title="Settings" description="Defaults applied to new events. Saved on this device.">
        <div className="space-y-6">
          <div>
            <span className={labelStyles}>Appearance</span>
            <Segmented
              ariaLabel="Appearance"
              value={appearance}
              onChange={setAppearance}
              options={[
                { label: "Auto", value: "auto", icon: appearanceIcon.auto },
                { label: "Light", value: "light", icon: appearanceIcon.light },
                { label: "Dark", value: "dark", icon: appearanceIcon.dark },
              ]}
            />
          </div>

          <div>
            <label className={labelStyles} htmlFor="default-timezone">
              Default time zone
            </label>
            <div className="relative">
              <select id="default-timezone" className={cn(fieldStyles, "appearance-none pr-10")} value={defaultTimezone} onChange={(event) => saveDefaults(defaultReminders, event.target.value)}>
                <option value="">Floating (no fixed time zone)</option>
                {timezoneOptionsFor(defaultTimezone).map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            </div>
          </div>

          <div>
            <label className={labelStyles} htmlFor="default-location">
              Default location
            </label>
            <input id="default-location" className={fieldStyles} placeholder="Optional" value={defaultLocation} onChange={(event) => saveDefaults(defaultReminders, defaultTimezone, event.target.value)} />
          </div>

          <div>
            <span className={labelStyles}>Default alerts for new events</span>
            <div className="space-y-2.5">
              {defaultReminders.length === 0 && <p className="text-[13px] text-[var(--text-tertiary)]">None.</p>}
              {defaultReminders.map((minutes, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <div className="relative flex-1">
                    <select
                      aria-label={`Default alert ${idx + 1}`}
                      className={cn(fieldStyles, "appearance-none py-2.5 pr-9")}
                      value={minutes}
                      onChange={(event) => {
                        const next = [...defaultReminders];
                        next[idx] = parseInt(event.target.value, 10);
                        saveDefaults(next, defaultTimezone);
                      }}
                    >
                      {REMINDER_OPTIONS.map((option) => (
                        <option key={option.minutes} value={option.minutes}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  </div>
                  <button type="button" aria-label="Remove default alert" onClick={() => saveDefaults(defaultReminders.filter((_, reminderIndex) => reminderIndex !== idx), defaultTimezone)} className="rounded-xl p-2.5 text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => saveDefaults([...defaultReminders, 15], defaultTimezone)} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent hover:underline">
              <Plus className="h-4 w-4" /> Add a default alert
            </button>
          </div>

          <button type="button" onClick={() => setShowSettings(false)} className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-white transition hover:bg-accent-hover">
            Done
          </button>
        </div>
      </Dialog>
    </div>
  );
}
