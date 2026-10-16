// Date helpers.
//
// Iron Log stores set dates as local calendar days ("YYYY-MM-DD") because
// "which day did I train" is a local question. Using toISOString() here
// would answer it in UTC, so an evening session in a timezone behind UTC
// would be filed under tomorrow.

export function localDateStr(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayStr() {
  return localDateStr();
}
