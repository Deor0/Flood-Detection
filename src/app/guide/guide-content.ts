/**
 * Flood Guide content. Every figure here was checked against the cited source on CHECKED_ON.
 * If a number could not be verified, the tip is written without one.
 */
export const CHECKED_ON = '2026-11-14';

export type Source = { id: string; name: string; url: string; note: string };

export const SOURCES: Source[] = [
  {
    id: 'nws-during',
    name: 'US National Weather Service: During a Flood',
    url: 'https://www.weather.gov/safety/flood-during',
    note: 'Moving water and vehicle depths. NWS offices quote slightly different vehicle depths.',
  },
  {
    id: 'nws-tadd',
    name: 'US National Weather Service: Turn Around Don’t Drown',
    url: 'https://www.weather.gov/safety/flood-turn-around-dont-drown',
    note: 'More than half of flood deaths happen when vehicles are swept downstream.',
  },
  {
    id: 'redcross',
    name: 'American Red Cross: Flood Safety',
    url: 'https://www.redcross.org/get-help/how-to-prepare-for-emergencies/types-of-emergencies/flood.html',
    note: 'Before, during and after tips; emergency kit; drying within 24 to 48 hours.',
  },
  {
    id: 'cdc-water',
    name: 'US CDC: Safety Guidelines, Floodwater',
    url: 'https://www.cdc.gov/floods/safety/floodwater-after-a-disaster-or-emergency-safety.html',
    note: 'Contaminated water, electrical hazards, generators 20 feet away, cleanup protection.',
  },
  {
    id: 'cdc-home',
    name: 'US CDC: Reentering Your Flooded Home',
    url: 'https://www.cdc.gov/floods/safety/reentering-your-flooded-home-safety.html',
    note: 'Check for damage and hazards before going back in.',
  },
  {
    id: 'wmo',
    name: 'WMO: Invest in early warnings and early action',
    url: 'https://wmo.int/node/20642',
    note: 'WMO attributes to the Global Commission on Adaptation: a 24-hour warning can cut potential damage by up to 30%. An estimate.',
  },
  {
    id: 'undrr',
    name: 'UNDRR and WMO: Global Status of Multi-Hazard Early Warning Systems (2022)',
    url: 'https://www.preventionweb.net/news/un-warns-half-world-not-prepared-disasters',
    note: 'Countries with limited early warning coverage have 8 times higher disaster mortality.',
  },
];

export type Tip = { text: string; why?: string; source?: string };

export type Phase = {
  id: 'before' | 'during' | 'after';
  title: string;
  lead: string;
  tips: Tip[];
};

export const PHASES: Phase[] = [
  {
    id: 'before',
    title: 'Before',
    lead: 'Quiet time. Ten minutes now saves hours later.',
    tips: [
      {
        text: 'Learn which kind of flood can reach you: flash flood, river flood or storm surge.',
        source: 'redcross',
      },
      {
        text: 'Pick a place on higher ground you can reach fast, and tell your family.',
        why: 'Flash floods can give little or no warning.',
        source: 'redcross',
      },
      {
        text: 'Know the words. A watch means flooding is possible. A warning means it is happening or about to.',
        source: 'redcross',
      },
      {
        text: 'Pack a kit: water, food that keeps, torch, battery radio, first aid, medicines, copies of papers.',
        why: 'Water: 1 gallon per person per day.',
        source: 'redcross',
      },
      {
        text: 'Agree with your family how to find each other if phones fail.',
      },
      {
        text: 'Act on early warnings. A day of notice makes a large difference.',
        why: 'A 24-hour warning can cut potential damage by up to 30% (estimate).',
        source: 'wmo',
      },
    ],
  },
  {
    id: 'during',
    title: 'During',
    lead: 'Get to higher ground. Do not test the water.',
    tips: [
      {
        text: 'Move to higher ground now. Do not wait to see how bad it gets.',
        source: 'nws-during',
      },
      {
        text: 'Never walk, swim or drive through floodwater. Turn around and take another route.',
        why: 'Six inches of fast-moving water can knock an adult over.',
        source: 'nws-during',
      },
      {
        text: 'If your car is in rising water, get out at once and go up.',
        why: 'More than half of flood deaths are in vehicles swept downstream.',
        source: 'nws-tadd',
      },
      {
        text: 'Follow official evacuation routes. Shortcuts may be blocked or flooded.',
        source: 'redcross',
      },
      {
        text: 'Keep children and pets away from floodwater. It can carry sewage and other harm.',
        source: 'redcross',
      },
      {
        text: 'Turn off power and water mains only if the authorities tell you to, and only if you can do it dry.',
        source: 'redcross',
      },
      {
        text: 'No mobile data? Use the Offline Helpline: call the voice line, or text SEARCH, MISSING or FOUND with a name.',
        why: 'Calls and texts often still get through when data and Wi-Fi are down. Details are under "Using this app in a flood" below.',
      },
    ],
  },
  {
    id: 'after',
    title: 'After',
    lead: 'The water may be gone. The danger is not.',
    tips: [
      {
        text: 'Go home only when officials say it is safe.',
        source: 'redcross',
      },
      {
        text: 'Check for fallen power lines, gas smells and cracks before you go in.',
        source: 'cdc-home',
      },
      {
        text: 'Do not touch wet electrical equipment, or any while standing in water. Have an electrician check first.',
        source: 'cdc-water',
      },
      {
        text: 'Drink only bottled, boiled or treated water until your supply is declared safe.',
        source: 'cdc-water',
      },
      {
        text: 'Throw away food, drinks and medicine that touched floodwater.',
        source: 'redcross',
      },
      {
        text: 'Dry the house quickly. Wear boots, gloves and eye protection. Keep generators outside.',
        why: 'Dry within 24 to 48 hours, or assume mold. Generators at least 20 feet from windows and doors.',
        source: 'cdc-water',
      },
    ],
  },
];

export type Stat = { value: string; label: string; source: string };

/** Vehicles and water: the NWS depths. Offices quote slightly different vehicle depths. */
export const WATER_DEPTHS: Stat[] = [
  { value: '6 in', label: 'of fast-moving water can knock an adult over', source: 'nws-during' },
  { value: '12 in', label: 'can float many cars and small SUVs', source: 'nws-during' },
  {
    value: '18–24 in',
    label: 'can carry away large SUVs, vans and trucks',
    source: 'nws-during',
  },
];

export const CARE_NOTES: Tip[] = [
  {
    text: 'Keep children and pets away from floodwater. It may be contaminated with sewage.',
    source: 'redcross',
  },
  {
    text: 'Keep children and pets out of the cleanup area until the work is finished.',
    source: 'cdc-water',
  },
];

export const WHY_IT_MATTERS: Stat[] = [
  {
    value: '30%',
    label: 'less potential damage with 24 hours of warning, up to (WMO, an estimate)',
    source: 'wmo',
  },
  {
    value: '8×',
    label:
      'higher disaster mortality where early warning coverage is limited (UNDRR and WMO, 2022)',
    source: 'undrr',
  },
  {
    value: '1 in 2+',
    label: 'flood deaths are vehicle-related (NWS)',
    source: 'nws-tadd',
  },
];

export const APP_LINKS = [
  {
    href: '/dashboard',
    title: 'Flood desk',
    text: 'Click a river to see how unusual its flow is.',
  },
  { href: '/missing', title: 'Missing People', text: 'Report someone, or mark a person found.' },
  { href: '/find', title: 'Find a person', text: 'Search by name. Shows status and area only.' },
  {
    href: '/sms-simulator',
    title: 'Offline Helpline',
    text: 'No internet? Call or text to search, report, or mark someone found.',
  },
  {
    href: '/communities',
    title: 'Communities',
    text: 'Find shelter, supply and recovery programs.',
  },
] as const;
