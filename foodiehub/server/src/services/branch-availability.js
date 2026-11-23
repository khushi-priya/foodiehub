const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const TIME_ZONE_FALLBACK = "Asia/Kolkata";
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/;

function parseMinutes(value) {
  if (typeof value !== "string") return null;
  const match = value.match(TIME_PATTERN);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function validDays(days) {
  return (
    Array.isArray(days) &&
    days.every((day) => DAY_NAMES.includes(day)) &&
    new Set(days).size === days.length
  );
}

function timeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function hasValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

function zonedPartsMatch(date, expected, timeZone) {
  const actual = timeZoneParts(date, timeZone);
  return ["year", "month", "day", "hour", "minute", "second"].every(
    (key) => Number(actual[key]) === expected[key],
  );
}

function localDateTimeToInstant(value, timeZone) {
  if (typeof value !== "string" || !hasValidTimeZone(timeZone))
    throw new Error("A valid local date/time and IANA time zone are required.");
  const zone = timeZone.trim();
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const absolute = new Date(value);
    if (Number.isNaN(absolute.getTime()))
      throw new Error("Invalid reservation date/time.");
    return absolute;
  }
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/,
  );
  if (!match) throw new Error("Use a valid local date and time.");
  const expected = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
  const wallTime = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
    expected.second,
  );
  const normalized = new Date(wallTime);
  if (
    normalized.getUTCFullYear() !== expected.year ||
    normalized.getUTCMonth() + 1 !== expected.month ||
    normalized.getUTCDate() !== expected.day
  )
    throw new Error("Invalid reservation calendar date.");

  // Sample nearby offsets so DST transitions are resolved using the branch's zone.
  const offsets = new Set();
  for (const deltaHours of [-36, -12, 0, 12, 36]) {
    const sample = new Date(wallTime + deltaHours * 60 * 60 * 1000);
    const parts = timeZoneParts(sample, zone);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    offsets.add(Math.round((representedAsUtc - sample.getTime()) / 60000));
  }
  const candidates = [...offsets]
    .map((offset) => new Date(wallTime - offset * 60000))
    .filter((candidate) => zonedPartsMatch(candidate, expected, zone))
    .sort((a, b) => a - b);
  if (!candidates.length)
    throw new Error(
      "That local time does not exist because of a daylight-saving clock change.",
    );
  // During a fall-back ambiguity, choose the first occurrence of that wall time.
  return candidates[0];
}

function localDateString(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftCalendarDate(year, month, day, days) {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function reservationFitsBranchHours(branch, start, end) {
  if (
    !branch?.isActive ||
    branch.approvalStatus !== "approved" ||
    ["inactive", "temporarily_closed"].includes(branch.operationalStatus)
  )
    return false;
  if (
    !(start instanceof Date) ||
    !(end instanceof Date) ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  )
    return false;
  const timeZone =
    typeof branch.timeZone === "string" ? branch.timeZone.trim() : "";
  if (!hasValidTimeZone(timeZone)) return false;
  const opening = parseMinutes(branch.openingTime);
  const closing = parseMinutes(branch.closingTime);
  if (opening === null || closing === null || opening === closing) return false;
  const workingDays = validDays(branch.workingDays)
    ? branch.workingDays
    : validDays(branch.closedDays)
      ? DAY_NAMES.filter((day) => !branch.closedDays.includes(day))
      : null;
  if (!workingDays?.length) return false;
  const days = validDays(branch.closedDays) ? branch.closedDays : [];
  const openDays = workingDays.filter((day) => !days.includes(day));
  const localStart = timeZoneParts(start, timeZone);
  const currentMinute =
    Number(localStart.hour) * 60 + Number(localStart.minute);
  let operatingDate = {
    year: Number(localStart.year),
    month: Number(localStart.month),
    day: Number(localStart.day),
  };
  let closingDate = operatingDate;
  if (branch.overnight === true) {
    if (closing >= opening) return false;
    if (currentMinute < closing) {
      operatingDate = shiftCalendarDate(
        operatingDate.year,
        operatingDate.month,
        operatingDate.day,
        -1,
      );
    } else if (currentMinute < opening) return false;
    closingDate = shiftCalendarDate(
      operatingDate.year,
      operatingDate.month,
      operatingDate.day,
      1,
    );
  } else {
    if (
      closing <= opening ||
      currentMinute < opening ||
      currentMinute >= closing
    )
      return false;
  }
  const operatingWeekday = timeZoneParts(
    new Date(
      Date.UTC(
        operatingDate.year,
        operatingDate.month - 1,
        operatingDate.day,
        12,
      ),
    ),
    "UTC",
  ).weekday;
  if (!openDays.includes(operatingWeekday)) return false;
  const closingLocal = `${localDateString(closingDate.year, closingDate.month, closingDate.day)}T${String(Math.floor(closing / 60)).padStart(2, "0")}:${String(closing % 60).padStart(2, "0")}:00`;
  let closesAt;
  try {
    closesAt = localDateTimeToInstant(closingLocal, timeZone);
  } catch {
    return false;
  }
  return end.getTime() <= closesAt.getTime();
}

function branchIsOpen(branch, now = new Date()) {
  if (!branch?.isActive || branch.approvalStatus !== "approved" || branch.operationalStatus === "inactive")
    return false;
  // A temporary/manual closure overrides the schedule only until its stored
  // reopening instant. The scheduled worker persists the reopening, but status
  // reads must also recover dynamically if that worker is delayed or offline.
  if (branch.operationalStatus === "temporarily_closed") {
    if (branch.temporaryClosureUntil == null) return false;
    const reopenAt = new Date(branch.temporaryClosureUntil);
    if (Number.isNaN(reopenAt.getTime()) || now.getTime() < reopenAt.getTime())
      return false;
  }
  try {
    const timeZone =
      typeof branch.timeZone === "string" && branch.timeZone.trim()
        ? branch.timeZone.trim()
        : TIME_ZONE_FALLBACK;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const today = values.weekday;
    const yesterday = DAY_NAMES[(DAY_NAMES.indexOf(today) + 6) % 7];
    const current = Number(values.hour) * 60 + Number(values.minute);
    const opening = parseMinutes(branch.openingTime);
    const closing = parseMinutes(branch.closingTime);
    let working;
    if (validDays(branch.workingDays)) working = branch.workingDays;
    else if (validDays(branch.closedDays))
      working = DAY_NAMES.filter((day) => !branch.closedDays.includes(day));
    else return false;
    if (validDays(branch.closedDays))
      working = working.filter((day) => !branch.closedDays.includes(day));
    if (
      opening === null ||
      closing === null ||
      opening === closing ||
      !working.length
    )
      return false;
    if (branch.overnight === true) {
      if (closing >= opening) return false;
      return (
        (working.includes(today) && current >= opening) ||
        (working.includes(yesterday) && current < closing)
      );
    }
    if (closing <= opening) return false;
    return working.includes(today) && current >= opening && current < closing;
  } catch {
    return false;
  }
}

function branchAvailabilityStatus(branch, now = new Date()) {
  return branchIsOpen(branch, now) ? "open" : "closed";
}

module.exports = {
  branchIsOpen,
  branchAvailabilityStatus,
  reservationFitsBranchHours,
  localDateTimeToInstant,
  TIME_ZONE_FALLBACK,
};
