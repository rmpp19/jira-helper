export type JiraChangelogItem = {
  field?: string;
  fromString?: string | null;
  toString?: string | null;
};

export type JiraChangelogHistory = {
  created?: string;
  items?: JiraChangelogItem[] | null;
};

export type JiraChangelog = {
  histories?: JiraChangelogHistory[] | null;
};

export type JiraIssueForReport = {
  key?: string;
  fields?: {
    summary?: string;
    priority?: { name?: string | null } | null;
    status?: { name?: string | null } | null;
    components?: { name?: string | null }[] | null;
    fixVersions?: { name?: string | null }[] | null;
    assignee?: { displayName?: string | null } | null;
    created?: string;
    resolutiondate?: string | null;
    customfield_10087?: unknown;
  };
  changelog?: JiraChangelog | null;
};

export type FilterReportRow = {
  issueKey: string;
  summary: string;
  priority: string | null;
  status: string | null;
  component: string | null;
  squad: string | null;
  fixVersion: string | null;
  assignee: string | null;
  created: string | null;
  resolved: string | null;
  firstInProgress: string | null;
  leadTimeToInProgressDays: number | null;
  cycleTimeDays: number | null;
  totalTimeToResolveDays: number | null;
  reopenCount: number;
  assigneeChangeCount: number;
  isHighOrHighest: boolean;
  notes: string | null;
};

const DONE_STATUSES = new Set(["done", "resolved", "closed"]);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time);
}

function diffInDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 0;
  const days = ms / (1000 * 60 * 60 * 24);
  return Number.isFinite(days) ? Number(days.toFixed(2)) : null;
}

function getFirstInProgressDate(changelog: JiraChangelog | null | undefined): Date | null {
  if (!changelog || !Array.isArray(changelog.histories)) return null;

  let earliest: Date | null = null;

  for (const history of changelog.histories) {
    if (!history || !Array.isArray(history.items)) continue;

    const historyCreated = parseDate(history.created);
    if (!historyCreated) continue;

    for (const item of history.items) {
      if (!item) continue;
      if (item.field !== "status") continue;

      const toName = (item.toString ?? "").toString().trim().toLowerCase();
      if (toName === "in progress") {
        if (!earliest || historyCreated.getTime() < earliest.getTime()) {
          earliest = historyCreated;
        }
        break;
      }
    }
  }

  return earliest;
}

function getReopenCount(changelog: JiraChangelog | null | undefined): number {
  if (!changelog || !Array.isArray(changelog.histories)) return 0;

  let count = 0;

  for (const history of changelog.histories) {
    if (!history || !Array.isArray(history.items)) continue;

    for (const item of history.items) {
      if (!item) continue;
      if (item.field !== "status") continue;

      const fromName = (item.fromString ?? "").toString().trim().toLowerCase();
      const toName = (item.toString ?? "").toString().trim().toLowerCase();

      if (!fromName || !toName) continue;

      if (DONE_STATUSES.has(fromName) && !DONE_STATUSES.has(toName)) {
        count += 1;
      }
    }
  }

  return count;
}

function getAssigneeChangeCount(changelog: JiraChangelog | null | undefined): number {
  if (!changelog || !Array.isArray(changelog.histories)) return 0;

  let count = 0;

  for (const history of changelog.histories) {
    if (!history || !Array.isArray(history.items)) continue;

    for (const item of history.items) {
      if (!item) continue;
      if (item.field === "assignee") {
        count += 1;
      }
    }
  }

  return count;
}

export function buildFilterReportRows(issues: JiraIssueForReport[]): FilterReportRow[] {
  return issues.map((issue) => {
    const key = typeof issue.key === "string" ? issue.key : "";
    const fields = issue.fields ?? {};

    const summary = (fields.summary ?? "") as string;
    const priorityName = (fields.priority?.name ?? null) as string | null;
    const statusName = (fields.status?.name ?? null) as string | null;

    const componentName = Array.isArray(fields.components) && fields.components.length > 0
      ? (fields.components[0]?.name ?? null)
      : null;

    const squadName = (() => {
      const raw = fields.customfield_10087;
      if (raw == null) return null;

      if (typeof raw === "string") {
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
      }

      if (typeof raw === "object") {
        const value = (raw as { value?: unknown; name?: unknown }).value
          ?? (raw as { value?: unknown; name?: unknown }).name;
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
      }

      return null;
    })();

    const fixVersionName = Array.isArray(fields.fixVersions) && fields.fixVersions.length > 0
      ? (fields.fixVersions[0]?.name ?? null)
      : null;

    const assigneeName = (fields.assignee?.displayName ?? null) as string | null;

    const createdRaw = (fields.created ?? null) as string | null;
    const resolvedRaw = (fields.resolutiondate ?? null) as string | null;

    const createdDate = parseDate(createdRaw ?? undefined);
    const resolvedDate = parseDate(resolvedRaw ?? undefined);
    const firstInProgressDate = getFirstInProgressDate(issue.changelog);

    const leadTimeToInProgressDays = diffInDays(createdDate, firstInProgressDate);
    const cycleTimeDays = diffInDays(firstInProgressDate, resolvedDate);
    const totalTimeToResolveDays = diffInDays(createdDate, resolvedDate);

    const reopenCount = getReopenCount(issue.changelog);
    const assigneeChangeCount = getAssigneeChangeCount(issue.changelog);

    const isHighOrHighest = (() => {
      if (!priorityName) return false;
      const p = priorityName.trim().toLowerCase();
      return p === "high" || p === "highest";
    })();

    return {
      issueKey: key,
      summary,
      priority: priorityName,
      status: statusName,
      component: componentName,
      squad: squadName,
      fixVersion: fixVersionName,
      assignee: assigneeName,
      created: createdRaw,
      resolved: resolvedRaw,
      firstInProgress: firstInProgressDate?.toISOString() ?? null,
      leadTimeToInProgressDays,
      cycleTimeDays,
      totalTimeToResolveDays,
      reopenCount,
      assigneeChangeCount,
      isHighOrHighest,
      notes: null,
    };
  });
}
