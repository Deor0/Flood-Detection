/**
 * Offline Helpline: what the site says about the voice line and the SMS line. Plain data only,
 * shared by the helpline page, the home page, Missing People, Find and the Flood Guide.
 * The command wording matches HELP_TEXT in src/core/sms/index.ts.
 */

export const HELPLINE_NAME = 'Offline Helpline';
/** Odyssey theme: the kicker shown above the plain name. */
export const HELPLINE_KICKER = 'The Beacon Line';
/** The voice agent's name (Odyssey: Mentor, Telemachus's guide). */
export const VOICE_AGENT_NAME = 'Mentor';
export const HELPLINE_PATH = '/sms-simulator';

/** The Vapi voice line (live). Set the number here to show it as a tap-to-call link. */
export const VOICE_NUMBER: string | null = null;

/** The SMS line is a pilot: it is live, but not yet open to every phone, so no number is published. */
export const SMS_STATUS = 'pilot' as const;

export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`;
}

export type HelplineCommand = {
  /** What to text. */
  sms: string;
  /** What to say on a call, or null when the voice line cannot do it. */
  voice: string | null;
  does: string;
  example: string;
  reply: string;
};

export const COMMANDS: HelplineCommand[] = [
  {
    sms: 'SEARCH <name>',
    voice: '"Is Maya Rai on the list?"',
    does: 'Checks the registry. Shows status and general area only.',
    example: 'SEARCH Maya Rai',
    reply: 'REG-01001 Maya Rai: MISSING (Rasuwa)',
  },
  {
    sms: 'MISSING <name>, <place>, <age>',
    voice: '"I want to report someone missing."',
    does: 'Files a report. Place and age are optional. The record appears on this site at once.',
    example: 'MISSING Maya Rai, Rasuwa, 34',
    reply: 'Report saved as REG-01001 for Maya Rai - send FOUND Maya Rai when they are found.',
  },
  {
    sms: 'FOUND <name>',
    voice: null,
    does: 'Marks a person you reported as found. Only the phone that reported them can do this.',
    example: 'FOUND Maya Rai',
    reply: 'REG-01001 Maya Rai is now marked FOUND. Thank you.',
  },
  {
    sms: 'STATUS <place>',
    voice: null,
    does: 'Points you to the river check on the web flood desk.',
    example: 'STATUS Kathmandu',
    reply: 'SIMULATION ONLY: live river status for Kathmandu is on the web flood desk...',
  },
  {
    sms: 'HELP',
    voice: '"What can you do?"',
    does: 'Lists every command.',
    example: 'HELP',
    reply: 'Commands: SEARCH <name> | MISSING <name>, <place>, <age> | FOUND <name> | ...',
  },
];

export const PRIVACY_POINTS = [
  'Searches show status and a general area only, never contact details.',
  'People under 18 appear as initials.',
  'Up to 10 reports per phone in 24 hours.',
  'Records are never deleted. A person moves from missing to found.',
] as const;
