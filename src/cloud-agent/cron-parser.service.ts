import { Injectable } from '@nestjs/common';

/**
 * Plain-English → cron parser for cloud-agent routines.
 *
 * The mobile app lets a Pro user type "every morning at 9am" instead of
 * "0 9 * * *". Parsing happens on the SERVER so the web dashboard and any
 * future client get it for free, and so a malicious client can never push an
 * arbitrary/invalid schedule to Agent37 (the parser is the validator).
 *
 * Cron-like input passes straight through (validated), so power users are
 * not blocked. Everything else must match a known phrase, or we return null
 * and the caller asks the user to rephrase.
 */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40,
  'forty-five': 45, 'half': 30, sixty: 60,
};

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

/** Matches a valid 5-field cron schedule (seconds are not supported here). */
const CRON_LIKE = /^(\*|[0-9*,/\-]+)\s+(\*|[0-9*,/\-]+)\s+(\*|[0-9*,/\-]+)\s+(\*|[0-9*,/\-]+)\s+(\*|[0-9*,/\-]+)$/;

interface ParsedTime {
  hour: number;
  minute: number;
}

@Injectable()
export class CronParserService {
  /**
   * Parse a plain-English schedule (or accept a raw cron expression).
   * Returns null when the input is neither cron-like nor a known phrase.
   */
  parse(input: string): { schedule: string } | null {
    const text = (input ?? '').trim().toLowerCase();
    if (!text) return null;

    // 1. Raw cron passes through if it is structurally valid.
    if (CRON_LIKE.test(text)) return { schedule: text.replace(/\s+/g, ' ').trim() };

    // 2. Pure interval forms ("every 30 minutes", "hourly") — checked BEFORE day/time
    //    forms so "every 30 minutes at 9am" stays an interval, not a daily time.
    if (/\b(every|each)\b.*\bminutes?\b/.test(text)) return this.parseInterval(text);
    if (/\b(hourly|every hour|every \d+ hours?)\b/.test(text)) return this.parseInterval(text);

    // 3. Day + time forms ("every monday at 9am", "weekdays at 8:30am", "daily at noon").
    const dayPhrase = this.parseDayPhrase(text);
    if (dayPhrase) return dayPhrase;

    // 4. Interval keywords without a clock ("daily", "weekly", "hourly") get defaults.
    const intervalDefault = this.parseInterval(text);
    if (intervalDefault) return intervalDefault;

    // 5. Bare time ("at 9", "5pm") = daily at that time.
    const time = this.parseTime(text);
    if (time) return { schedule: `${time.minute} ${time.hour} * * *` };

    return null;
  }

  private parseInterval(text: string): { schedule: string } | null {
    // "every 15 minutes", "every thirty minutes", "hourly", "every hour"
    const minutes = text.match(/every\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five|sixty)\s+minutes?/);
    if (minutes) {
      const n = this.toNumber(minutes[1]);
      if (n && n >= 1 && n <= 59) return { schedule: `*/${n} * * * *` };
    }
    const hours = text.match(/every\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty-four)\s+hours?/);
    if (hours) {
      const n = this.toNumber(hours[1]);
      if (n && n >= 1 && n <= 23) return { schedule: `0 */${n} * * *` };
    }
    if (/\b(hourly|every hour)\b/.test(text)) return { schedule: '0 * * * *' };
    if (/\b(daily|every day|everyday|each day|once a day)\b/.test(text)) {
      // Daily without a clock: default to 9am local.
      return { schedule: '0 9 * * *' };
    }
    if (/\b(every|each)\b\s+(morning|afternoon|evening|night)\b/.test(text)) {
      return { schedule: '0 9 * * *' };
    }
    if (/\b(weekly|every week|each week|once a week)\b/.test(text)) {
      return { schedule: '0 9 * * 1' };
    }
    if (/\b(monthly|every month|each month|once a month)\b/.test(text)) {
      return { schedule: '0 9 1 * *' };
    }
    return null;
  }

  private parseDayPhrase(text: string): { schedule: string } | null {
    // Collect explicit day names.
    const days: number[] = [];
    for (const [name, num] of Object.entries(DAY_NAMES)) {
      // s? matches plurals ("mondays"); \b keeps "mon" from matching inside "month".
      if (new RegExp(`\\b${name}s?\\b`).test(text)) days.push(num);
    }

    const isWeekdays = /\b(weekdays?|every weekday|work ?days?|business days?)\b/.test(text);
    const isWeekends = /\b(weekends?|every weekend)\b/.test(text);

    let dow: string | null = null;
    if (days.length > 0) {
      dow = [...new Set(days)].sort((a, b) => a - b).join(',');
    } else if (isWeekdays) {
      dow = '1-5';
    } else if (isWeekends) {
      dow = '0,6';
    } else if (/\b(daily|every day|everyday|each day|once a day)\b/.test(text)) {
      dow = '*';
    }

    // No day word and no daily keyword — this isn't a day-phrase; let the
    // caller's later branches (interval defaults / bare time) handle it.
    if (dow === null) return null;

    const time = this.parseTime(text);
    if (!time) {
      // Day mentioned but no clock: default to 9am.
      return { schedule: `0 9 * * ${dow}` };
    }
    return { schedule: `${time.minute} ${time.hour} * * ${dow}` };
  }

  /** Extracts the FIRST clock time from the text; null when none is present. */
  private parseTime(text: string): ParsedTime | null {
    const noon = /\b(noon|midday)\b/.test(text);
    const midnight = /\b(midnight)\b/.test(text);

    // "9:30am" / "09:30" / "9.30pm" / "17:00"
    const hm = text.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/);
    if (hm) {
      let hour = parseInt(hm[1], 10);
      const minute = parseInt(hm[2], 10);
      if (minute > 59 || hour > 23) return null;
      if (hm[3] === 'pm' && hour < 12) hour += 12;
      if (hm[3] === 'am' && hour === 12) hour = 0;
      return { hour, minute };
    }

    // "9am" / "5pm" / "at 9" / "9 o'clock"
    const hOnly = text.match(/\b(\d{1,2})\s*(am|pm|o'?clock)\b/)
      ?? text.match(/\bat\s+(\d{1,2})\b/);
    if (hOnly) {
      let hour = parseInt(hOnly[1], 10);
      if (hour > 23) return null;
      if (hOnly[2] === 'pm' && hour < 12) hour += 12;
      if (hOnly[2] === 'am' && hour === 12) hour = 0;
      return { hour, minute: 0 };
    }

    if (noon) return { hour: 12, minute: 0 };
    if (midnight) return { hour: 0, minute: 0 };
    return null;
  }

  private toNumber(word: string): number | null {
    if (/^\d+$/.test(word)) return parseInt(word, 10);
    return WORD_NUMBERS[word] ?? null;
  }
}

/** Sanity export for tests. */
export function isCronLike(s: string): boolean {
  return CRON_LIKE.test((s ?? '').trim());
}
