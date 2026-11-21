const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function validTimeZone(value) {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch (_) {
    return false;
  }
}

export function validateCalendarEvent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "A JSON event body is required.";
  if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 120 || /[\r\n]/.test(body.title)) {
    return "Event titles must be between 1 and 120 characters.";
  }
  if (typeof body.description !== "string" || body.description.trim().length > 2000) {
    return "Event descriptions must be 2000 characters or fewer.";
  }
  if (typeof body.starts_at !== "string" || !ISO_TIMESTAMP.test(body.starts_at) || !Number.isFinite(Date.parse(body.starts_at))) {
    return "Choose a valid event date and time.";
  }
  const wallTime = body.starts_at.slice(0, 19);
  const wallTimeDate = new Date(`${wallTime}Z`);
  if (!Number.isFinite(wallTimeDate.getTime()) || wallTimeDate.toISOString().slice(0, 19) !== wallTime) {
    return "Choose a valid event date and time.";
  }
  if (!validTimeZone(body.timezone)) return "Choose a valid time zone.";
  return null;
}

function localDateAndHour(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function reminderTypeForEvent(event, now = new Date()) {
  const start = new Date(event.starts_at);
  if (!Number.isFinite(start.getTime()) || start <= now || !validTimeZone(event.timezone)) return null;

  const { date: today, hour } = localDateAndHour(now, event.timezone);
  if (hour < 9) return null;
  if (event.event_local_date === today) return "event_day";
  if (event.event_local_date === addDays(today, 1)) return "day_before";
  return null;
}

export function eventLocalDate(startsAt, timeZone) {
  return localDateAndHour(new Date(startsAt), timeZone).date;
}
