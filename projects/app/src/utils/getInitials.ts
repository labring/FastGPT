/**
 * Regular expressions matching characters to ignore when calculating the initials.
 */

/**
 * Regular expression matching characters within various types of enclosures, including the enclosures themselves
 *  so for example, (xyz) [xyz] {xyz} all would be ignored
 */
const UNWANTED_ENCLOSURES_REGEX: RegExp = /[\(\[\{][^\)\]\}]*[\)\]\}]/g;

/**
 * Regular expression matching special ASCII characters except space, plus some unicode special characters.
 * Applies after unwanted enclosures have been removed
 */
const UNWANTED_CHARS_REGEX: RegExp = /[\0-\u001F\!-/:-@\[-`\{-\u00BF\u0250-\u036F\uD800-\uFFFF]/g;

/**
 * Regular expression matching phone numbers. Applied after chars matching UNWANTED_CHARS_REGEX have been removed
 * and number has been trimmed for whitespaces
 */
const PHONENUMBER_REGEX: RegExp = /^\d+[\d\s]*(:?ext|x|)\s*\d+$/i;

/** Regular expression matching one or more spaces. */
const MULTIPLE_WHITESPACES_REGEX: RegExp = /\s+/g;

const UNSUPPORTED_TEXT_REGEX: RegExp =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]|[\uD840-\uD869][\uDC00-\uDED6]/;

function getInitialsLatin(displayName: string, isRtl: boolean): string {
  let initials = '';

  const splits: string[] = displayName.split(' ');

  if (splits.length === 2) {
    initials += splits[0].charAt(0).toUpperCase();
    initials += splits[1].charAt(0).toUpperCase();
  } else if (splits.length === 3) {
    initials += splits[0].charAt(0).toUpperCase();
    initials += splits[2].charAt(0).toUpperCase();
  } else if (splits.length !== 0) {
    initials += splits[0].charAt(0).toUpperCase();
  }

  if (isRtl && initials.length > 1) {
    return initials.charAt(1) + initials.charAt(0);
  }

  return initials;
}

function cleanupDisplayName(displayName: string): string {
  displayName = displayName.replace(UNWANTED_ENCLOSURES_REGEX, '');
  displayName = displayName.replace(UNWANTED_CHARS_REGEX, '');
  displayName = displayName.replace(MULTIPLE_WHITESPACES_REGEX, ' ');
  displayName = displayName.trim();

  return displayName;
}

/**
 * Get (up to 2 characters) initials based on display name of the persona.
 *
 * @public
 */
export function getInitials(
  displayName: string | undefined | null,
  isRtl: boolean,
  allowPhoneInitials?: boolean
): string {
  if (!displayName) {
    return '';
  }

  displayName = cleanupDisplayName(displayName);

  // For names containing CJK characters, and phone numbers, we don't display initials
  // if (
  //   UNSUPPORTED_TEXT_REGEX.test(displayName) ||
  //   (!allowPhoneInitials && PHONENUMBER_REGEX.test(displayName))
  // ) {
  //   return '';
  // }

  return getInitialsLatin(displayName, isRtl);
}
