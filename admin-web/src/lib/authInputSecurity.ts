export type AuthInputCheck = { ok: true; value: string } | { ok: false; error: string };

const EMAIL_MAX = 254;
const PASSWORD_MAX = 128;
const PASSWORD_MIN = 6;

const EMAIL_CHAR_FILTER = /[^a-zA-Z0-9@._+\-]/g;
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/** Shell / SQL metacharacters blocked on admin signup passwords. */
const COMMAND_CHARS = '$`|;&<>\\(){}[]\'"\n\r\t';

const SQL_INJECTION =
  /\b(select|union|insert|update|delete|drop|truncate|alter|create|exec|execute|xp_|sleep\s*\(|benchmark\s*\(|'\s*or\s*'|"\s*or\s*"|--|\/\*|\*\/|;)\b/i;

const EMAIL_FORMAT = /^[a-zA-Z0-9._+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function hasCommandChar(value: string): boolean {
  for (const ch of value) {
    if (COMMAND_CHARS.includes(ch)) return true;
  }
  return false;
}

function stripCommandChars(value: string): string {
  let out = '';
  for (const ch of value) {
    if (!COMMAND_CHARS.includes(ch)) out += ch;
  }
  return out;
}

/** Strip disallowed characters as the user types (email). */
export function sanitizeAuthEmail(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').replace(EMAIL_CHAR_FILTER, '').slice(0, EMAIL_MAX);
}

/** Login password: remove control chars only (keep $ and other valid password symbols). */
export function sanitizeAuthPassword(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').slice(0, PASSWORD_MAX);
}

/** Signup password: optional strict filter for shell/command metacharacters (admin). */
export function sanitizeAuthPasswordSignup(raw: string, strictCommandFilter: boolean): string {
  let value = sanitizeAuthPassword(raw);
  if (strictCommandFilter) value = stripCommandChars(value);
  return value;
}

export function containsSqlInjectionPattern(value: string): boolean {
  return SQL_INJECTION.test(value.trim());
}

export function validateAuthEmail(raw: string): AuthInputCheck {
  const value = sanitizeAuthEmail(raw.trim());
  if (!value) return { ok: false, error: 'Please enter a valid email address.' };
  if (containsSqlInjectionPattern(value)) {
    return { ok: false, error: 'Invalid characters detected in email.' };
  }
  if (!EMAIL_FORMAT.test(value)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  return { ok: true, value };
}

export type PasswordValidateOptions = {
  mode: 'login' | 'signup';
  /** Block $ ; | & and similar in new passwords (admin signup). */
  strictCommandFilter?: boolean;
};

export function validateAuthPassword(raw: string, opts: PasswordValidateOptions): AuthInputCheck {
  const value = sanitizeAuthPassword(raw);
  if (!value) return { ok: false, error: 'Please enter your password.' };
  if (opts.mode === 'signup' && value.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  if (opts.mode === 'signup' && opts.strictCommandFilter && hasCommandChar(value)) {
    return {
      ok: false,
      error: 'Password contains unsupported characters ($ ; | & etc.). Use letters, numbers, and !@#%-_.',
    };
  }
  return { ok: true, value };
}

export function parseAuthCredentials(
  email: string,
  password: string,
  opts: PasswordValidateOptions
): { ok: true; email: string; password: string } | { ok: false; error: string } {
  const emailCheck = validateAuthEmail(email);
  if (!emailCheck.ok) return emailCheck;
  const passwordCheck = validateAuthPassword(password, opts);
  if (!passwordCheck.ok) return passwordCheck;
  return { ok: true, email: emailCheck.value, password: passwordCheck.value };
}
