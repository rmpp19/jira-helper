export type CarryOverIssue = {
  key: string;
  sprintName?: string | null;
  carryoverReason?: string | null;
  carryoverDetail?: string | null;
};

export type GetCarryOverOptions = {
  sprintName?: string;
};

/**
 * Returns tickets that qualify as "carry-over" based on the following rule:
 * - A ticket is a carry-over ticket if carryoverReason has a value OR
 *   carryoverDetail has a value (after trimming whitespace).
 *
 * When a sprintName is provided, only tickets from that sprint are considered.
 * If no tickets exist for the requested sprint name, an error is thrown to
 * signal that the sprint name is invalid or not found.
 */
export function getCarryOverTickets<T extends CarryOverIssue>(
  issues: T[],
  options: GetCarryOverOptions = {},
): T[] {
  const { sprintName } = options;

  const isCarryOver = (issue: CarryOverIssue): boolean => {
    const hasReason = typeof issue.carryoverReason === "string" && issue.carryoverReason.trim().length > 0;
    const hasDetail = typeof issue.carryoverDetail === "string" && issue.carryoverDetail.trim().length > 0;
    return hasReason || hasDetail;
  };

  if (sprintName && sprintName.trim().length > 0) {
    const inSprint = issues.filter((issue) => issue.sprintName === sprintName);

    if (inSprint.length === 0) {
      throw new Error(`Sprint name is invalid or not found: ${sprintName}`);
    }

    return inSprint.filter(isCarryOver);
  }

  return issues.filter(isCarryOver);
}
