/**
 * Flood Guide content. Every figure here was checked against the cited source on CHECKED_ON.
 * If a number could not be verified, the tip is written without one.
 */
export const CHECKED_ON = '2026-11-15';

export type Source = { id: string; name: string; url: string; note: string };

export const SOURCES: Source[] = [
  {
    id: 'nws-during',
    name: 'US National Weather Service: During a Flood',
    url: 'https://www.weather.gov/safety/flood-during',
    note: 'Higher ground, evacuation orders, 6 inches of moving water, 12 and 18 inches for vehicles, what to do if trapped by moving water.',
  },
  {
    id: 'nws-tadd',
    name: 'US National Weather Service: Turn Around Don’t Drown',
    url: 'https://www.weather.gov/safety/flood-turn-around-dont-drown',
    note: 'Citing the CDC: over half of all flood-related drownings occur when a vehicle is driven into hazardous flood water.',
  },
  {
    id: 'ready-flood',
    name: 'Ready.gov (FEMA): Floods',
    url: 'https://www.ready.gov/floods',
    note: 'Evacuation routes, staying off bridges, a car trapped in moving water, being trapped in a building, turning off electricity.',
  },
  {
    id: 'ready-kit',
    name: 'Ready.gov (FEMA): Build a Kit',
    url: 'https://www.ready.gov/kit',
    note: 'Basic kit items; water: one gallon per person per day for several days.',
  },
  {
    id: 'ready-debris',
    name: 'Ready.gov (FEMA): Landslides and Debris Flow',
    url: 'https://www.ready.gov/landslides-debris-flow',
    note: 'Warning signs (rumbling, clear water turning muddy, sudden change in flow), moving uphill, not crossing bridges when a flow is coming.',
  },
  {
    id: 'icimod-glof',
    name: 'ICIMOD: Glacial lake outburst floods in High Mountain Asia documented in regional effort (15 Dec 2023)',
    url: 'https://www.icimod.org/media-advisory/glacial-lake-outburst-floods-in-high-mountain-asia-documented-in-regional-effort/',
    note: 'Over 700 GLOFs recorded; 54% triggered by mass movement such as avalanches, rock falls and landslides; GLOFs from China have hit Nepal.',
  },
  {
    id: 'redcross',
    name: 'American Red Cross: Flood Safety',
    url: 'https://www.redcross.org/get-help/how-to-prepare-for-emergencies/types-of-emergencies/flood.html',
    note: 'Types of flooding, a place on higher ground, watch vs warning, spoiled food, sewage in floodwater, drying within 24 to 48 hours.',
  },
  {
    id: 'cdc-water',
    name: 'US CDC: Safety Guidelines, Floodwater',
    url: 'https://www.cdc.gov/floods/safety/floodwater-after-a-disaster-or-emergency-safety.html',
    note: 'Children and floodwater, boots and gloves for cleanup.',
  },
  {
    id: 'cdc-home',
    name: 'US CDC: Reentering Your Flooded Home',
    url: 'https://www.cdc.gov/floods/safety/reentering-your-flooded-home-safety.html',
    note: 'Gas leaks, inspection before re-entry, electrical safety, safe water, generators at least 20 feet from windows, doors and vents.',
  },
  {
    id: 'wmo',
    name: 'WMO: Invest in early warnings and early action',
    url: 'https://wmo.int/news/media-centre/climate-adaptation-summit-invest-early-warnings-and-early-action',
    note: 'WMO attributes to the Global Commission on Adaptation: a 24-hour warning can cut the ensuing damage by 30%. An estimate.',
  },
  {
    id: 'undrr',
    name: 'UNDRR and WMO: Global Status of Multi-Hazard Early Warning Systems (2022)',
    url: 'https://wmo.int/news/media-centre/un-warns-half-world-not-prepared-disasters',
    note: 'Countries with limited early warning coverage have disaster mortality eight times higher than those with substantial to comprehensive coverage.',
  },
];

/** Emergency numbers we have checked. Anywhere else: your local emergency number. */
export const EMERGENCY_NUMBERS = [
  { place: 'United States', label: 'Call 911', tel: '911', source: 'nws-during' },
  {
    place: 'Nepal',
    label: 'Nepal Police: 100',
    tel: '100',
    sourceUrl: 'https://www.nepalpolice.gov.np/stations/emergency-contacts/',
  },
] as const;

export type Tip = { text: string; why?: string; source?: string };

export type Phase = {
  id: 'before' | 'during' | 'after';
  title: string;
  /** Odyssey subtitle (Circe's Chart). The plain title always comes first. */
  theme: string;
  lead: string;
  tips: Tip[];
};

const DURING: Phase = {
  id: 'during',
  title: 'During: act now',
  theme: 'The storm',
  lead: 'Get to higher ground. Do not test the water.',
  tips: [
    {
      text: 'Move to higher ground now. If told to evacuate, go at once. Do not wait to see how bad it gets.',
      source: 'nws-during',
    },
    {
      text: 'Never walk, swim or drive through floodwater. Turn around and take another route.',
      why: 'Six inches of moving water can knock you off your feet.',
      source: 'nws-during',
    },
    {
      text: 'If you are trapped by moving water, get to the highest point you can and call 911 (or your local emergency number).',
      source: 'nws-during',
    },
    {
      text: 'If you are trapped in a building, go to the highest level. Do not climb into a closed attic: rising water can trap you there. Go onto the roof only if you must, and signal for help.',
      source: 'ready-flood',
    },
    {
      text: 'If your car is trapped in fast-moving water, stay inside. If water rises inside the car, get onto the roof.',
      source: 'ready-flood',
    },
    {
      text: 'Stay off bridges over fast-moving water. It can wash a bridge away without warning.',
      source: 'ready-flood',
    },
    {
      text: 'Keep yourself, children and pets out of floodwater. It may carry sewage, sharp objects and chemicals.',
      source: 'redcross',
    },
    {
      text: 'Stay out of any room where water covers the outlets or cords. If you see sparks or hear buzzing or popping, get out.',
      source: 'nws-during',
    },
    {
      text: 'No mobile data? Use the Offline Helpline: call the voice line, or text SEARCH, MISSING or FOUND with a name.',
      why: 'Calls and texts often still get through when data and Wi-Fi are down. Details are under "Using this app in a flood" below.',
    },
  ],
};

const BEFORE: Phase = {
  id: 'before',
  title: 'Before',
  theme: 'Rig the ship',
  lead: 'Quiet time. Ten minutes now saves hours later.',
  tips: [
    {
      text: 'Learn which kind of flood can reach you: flash flood, river flood, storm surge, debris flow or dam break.',
      source: 'redcross',
    },
    {
      text: 'Pick a place on higher ground you can reach fast, and tell your family.',
      why: 'Flash floods can be sudden and violent, with little or no warning.',
      source: 'redcross',
    },
    {
      text: 'Learn and practise your evacuation routes and shelter plan.',
      source: 'ready-flood',
    },
    {
      text: 'Know the words. A watch means flooding is possible. A warning means it is happening or about to.',
      source: 'redcross',
    },
    {
      text: 'Pack a kit: water, food that keeps, flashlight, battery or hand-crank radio, first aid, extra batteries, a whistle, phone charger, medicines.',
      why: 'Water: one gallon per person per day, for several days.',
      source: 'ready-kit',
    },
    {
      text: 'Keep copies of important papers in a waterproof container.',
      source: 'ready-flood',
    },
    {
      text: 'Agree with your family how to find each other if phones fail.',
    },
    {
      text: 'Act on early warnings. A day of notice makes a large difference.',
      why: 'A 24-hour warning can cut the ensuing damage by 30% (an estimate).',
      source: 'wmo',
    },
  ],
};

const AFTER: Phase = {
  id: 'after',
  title: 'After',
  theme: 'The road to Ithaca',
  lead: 'The water may be gone. The danger is not.',
  tips: [
    {
      text: 'Go home only when officials say it is safe.',
      source: 'redcross',
    },
    {
      text: 'If the house is damaged, stay out until a building inspector has checked it. If you smell gas, leave at once.',
      source: 'cdc-home',
    },
    {
      text: 'Never switch power on or off, or use an electrical tool, while standing in water. Have an electrician check the system before the power goes back on.',
      source: 'cdc-home',
    },
    {
      text: 'Drink and cook only with bottled, boiled or treated water, and follow local guidance on whether tap water is safe.',
      source: 'cdc-home',
    },
    {
      text: 'Throw out food that got wet or warm. When in doubt, throw it out.',
      source: 'redcross',
    },
    {
      text: 'Dry the house and everything in it as fast as you can.',
      why: 'If it cannot be dried within 24 to 48 hours, assume there is mold.',
      source: 'redcross',
    },
    {
      text: 'For cleanup, wear rubber boots and gloves.',
      source: 'cdc-water',
    },
    {
      text: 'Run generators and other gasoline engines outside only, at least 20 feet from any window, door or vent.',
      source: 'cdc-home',
    },
  ],
};

/** Emergency order: During first, then Before, then After. */
export const PHASES: Phase[] = [DURING, BEFORE, AFTER];

/** Steep valleys (the Himalaya): glacial lake outburst floods (GLOFs) and debris flows. */
export const MOUNTAIN_TIPS: Tip[] = [
  {
    text: 'Go uphill, away from the river channel, at the first warning or sign. Do not go toward the channel or the slide area.',
    why: 'By the time you are sure a debris flow is coming, it will be too late to get away safely.',
    source: 'ready-debris',
  },
  {
    text: 'Treat a rumble that grows louder, trees cracking or boulders knocking together as a warning.',
    source: 'ready-debris',
  },
  {
    text: 'Near a stream, watch for a sudden rise or drop in the flow, or clear water turning muddy. These can mean a flow is coming.',
    source: 'ready-debris',
  },
  {
    text: 'Never cross a road with water or mud flowing over it, or a bridge if you see a flow coming.',
    source: 'ready-debris',
  },
  {
    text: 'Rain is not the only trigger. Avalanches, rock falls and landslides set off over half (54%) of recorded glacial lake outbursts in High Mountain Asia.',
    why: 'An outburst in one country can flood another: GLOFs in China have hit Nepal.',
    source: 'icimod-glof',
  },
];

export type Stat = { value: string; label: string; source: string };

/** Vehicles and water: the NWS depths. Offices quote slightly different vehicle depths. */
export const WATER_DEPTHS: Stat[] = [
  { value: '6 in', label: 'of moving water can knock you off your feet', source: 'nws-during' },
  { value: '12 in', label: 'of water can float a car or small SUV', source: 'nws-during' },
  { value: '18 in', label: 'of water can carry away large vehicles', source: 'nws-during' },
];

export const CARE_NOTES: Tip[] = [
  {
    text: 'Keep children and pets away from floodwater. It may contain sewage, sharp objects and chemicals.',
    source: 'redcross',
  },
  {
    text: 'Do not let children play in floodwater areas, or with toys that floodwater has touched.',
    source: 'cdc-water',
  },
];

export const WHY_IT_MATTERS: Stat[] = [
  {
    value: '30%',
    label:
      'less damage with 24 hours of warning (WMO citing the Global Commission on Adaptation, an estimate)',
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
    label: 'flood-related drownings happen when a vehicle is driven into floodwater (CDC, via NWS)',
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
