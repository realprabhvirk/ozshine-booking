// The database raises errors as `oz_raise(CODE, detail)`: SQLSTATE P0001,
// message = a stable CODE, details = a sentence safe to show a person. This
// turns any thrown thing (Supabase error, network failure, bug) into an
// AppError with a code the UI can branch on and a friendly message.

export const ERROR_MESSAGES: Record<string, string> = {
  // Booking times
  ONLINE_BOOKING_OFF: "We're not taking online bookings right now. Give us a call and we'll sort you out.",
  TOO_FAR: "That date is too far ahead. Please pick a closer day.",
  CLOSED: "We're closed then. Please pick another day.",
  OUTSIDE_HOURS: "That time is outside our opening hours for this service.",
  PAST: "That time has already passed.",
  TOO_SOON: "That's a bit too soon for us to fit you in. Please pick a later time.",
  SLOT_TAKEN: "Sorry, that time was just taken. Please pick another.",
  // Public booking
  INVALID_INPUT: "Something in the form isn't right. Please check and try again.",
  INVALID_PHONE: "That doesn't look like a valid phone number.",
  THROTTLED: "Too many attempts. Please wait a little and try again, or give us a call.",
  TOO_MANY_PENDING: "You already have bookings waiting for confirmation. Give us a call if you need more.",
  PROMO_INVALID: "That code isn't valid for this booking.",
  REWARD_INVALID: "That reward can't be used here.",
  CANNOT_MODIFY: "This booking can't be changed online any more. Please give us a call.",
  NOT_COMPLETED: "You can leave feedback once your car's done.",
  ALREADY_SUBMITTED: "Thanks, we've already got your feedback for this visit.",
  // Accounts
  NOT_SIGNED_IN: "Please sign in first.",
  NOT_LINKED: "We couldn't find your customer profile.",
  PHONE_IN_USE: "That phone number is already used by another customer.",
  NOT_STAFF: "This account isn't set up as staff.",
  // Staff / PIN
  PIN_REQUIRED: 'Tap "Who\'s working?" and enter your PIN first.',
  PIN_LOCKED: "Too many wrong PINs. Try again in a few minutes.",
  PIN_NOT_SET: "This person hasn't set a PIN yet.",
  WRONG_PIN: "That PIN isn't right.",
  INVALID_PIN: "PINs are 4 to 6 digits.",
  ADMIN_REQUIRED: "Only an admin can do that.",
  LAST_ADMIN: "You can't remove the last admin.",
  ALREADY_STAFF: "That person is already on the team.",
  // Workflow
  ILLEGAL_TRANSITION: "That step isn't possible from the booking's current status.",
  INVOICE_REQUIRED: "Create the invoice before completing this job.",
  NO_FREE_BAY: "All bays are busy.",
  BAY_BUSY: "That bay is already in use.",
  REASON_REQUIRED: "Please give a reason.",
  // Money
  CANNOT_INVOICE: "This booking can't be invoiced in its current state.",
  CANNOT_PAY: "This invoice can't take payments.",
  OVERPAYMENT: "That's more than what's owing.",
  BELOW_PAID: "The total can't go below what's already been paid.",
  HAS_PAYMENTS: "Refund the payments before voiding this invoice.",
  INVOICE_VOID: "This invoice has been voided.",
  ALREADY_PAID: "This is already paid.",
  VOUCHER_INVALID: "That voucher isn't valid.",
  VOUCHER_BALANCE: "Not enough left on that voucher.",
  // Records
  NOT_FOUND: "We couldn't find that. It may have been removed.",
  DUPLICATE: "That already exists.",
  IN_USE: "That's still in use, so it can't be removed.",
  ALREADY_MERGED: "That customer has already been merged.",
  BOTH_HAVE_ACCOUNTS: "Both customers have online accounts, so they can't be merged.",
  ALREADY_CLOSED: "This day has already been closed.",
  TOO_MANY_ROWS: "That file has too many rows. Split it up and try again.",
  INVALID_KEY: "This link isn't valid.",
  // Client-side
  NETWORK: "Can't reach the server. Check the internet connection and try again.",
  PERMISSION: "You don't have permission to do that.",
  UNKNOWN: "Something went wrong. Please try again.",
};

export class AppError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message || ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN);
    this.name = "AppError";
    this.code = code;
  }
}

type PostgrestLike = { message?: unknown; details?: unknown; code?: unknown };

function isPostgrestLike(e: unknown): e is PostgrestLike {
  return typeof e === "object" && e !== null && "message" in e;
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) {
    return new AppError("NETWORK");
  }
  if (isPostgrestLike(e)) {
    const message = typeof e.message === "string" ? e.message : "";
    const details = typeof e.details === "string" ? e.details : "";
    const sqlstate = typeof e.code === "string" ? e.code : "";
    // Our own oz_raise(): the message is the CODE.
    if (/^[A-Z][A-Z0-9_]{2,}$/.test(message)) {
      return new AppError(message, details || undefined);
    }
    if (sqlstate === "42501" || /permission denied|row-level security/i.test(message)) {
      return new AppError("PERMISSION");
    }
    if (sqlstate === "23505") return new AppError("DUPLICATE");
    if (/fetch|network/i.test(message)) return new AppError("NETWORK");
  }
  return new AppError("UNKNOWN");
}

export function errorMessage(e: unknown): string {
  return toAppError(e).message;
}
