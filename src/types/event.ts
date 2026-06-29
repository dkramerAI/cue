export interface Reminder {
  id: string;
  minutes: number;
}

export interface RecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "";
  interval: number;
  count?: number;
  until?: string;
  byDay?: string[];
  byMonthDay?: number[];
  bySetPos?: number;
}

export interface EventFormData {
  title: string;
  description: string;
  location: string;
  url: string;
  notes: string;
  organizer: string;
  organizerEmail: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  timezone: string;
  reminders: Reminder[];
  recurrence: RecurrenceRule;
  exdates: string[];
}

export const REMINDER_OPTIONS = [
  { label: "At time of event", minutes: 0 },
  { label: "5 minutes before", minutes: 5 },
  { label: "10 minutes before", minutes: 10 },
  { label: "15 minutes before", minutes: 15 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "2 hours before", minutes: 120 },
  { label: "1 day before", minutes: 1440 },
  { label: "2 days before", minutes: 2880 },
  { label: "1 week before", minutes: 10080 },
];
