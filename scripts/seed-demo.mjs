import postgres from 'postgres';

try {
  process.loadEnvFile('.env');
} catch {
  // DATABASE_URL may already be in the environment.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Nothing was changed.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const people = [
  {
    name: 'David Miller',
    nameNormalized: 'david miller',
    age: 42,
    location: 'Riverside Park, east gate',
    notes: 'Last seen near the footbridge during the evening flood watch.',
    contact: 'Sister, Maya Miller',
    status: 'missing',
    foundNote: null,
  },
  {
    name: 'José Álvarez',
    nameNormalized: 'jose alvarez',
    age: 67,
    location: 'Oak Street shelter line',
    notes: 'Uses a cane. Speaks Spanish.',
    contact: 'Neighbor, Luis Álvarez',
    status: 'missing',
    foundNote: null,
  },
  {
    name: 'Amina Rahman',
    nameNormalized: 'amina rahman',
    age: 8,
    location: 'Lincoln Elementary',
    notes: 'Wearing a red raincoat.',
    contact: 'Father, Karim Rahman',
    status: 'found',
    foundNote: 'Sheltered at Central Community Post',
  },
  {
    name: 'Priya Shah',
    nameNormalized: 'priya shah',
    age: 31,
    location: 'Market Street clinic',
    notes: 'Looking for her brother after the water rose.',
    contact: 'Clinic desk',
    status: 'missing',
    foundNote: null,
  },
];

const programs = [
  {
    title: 'Community CPR refresher',
    category: 'first_aid_cpr',
    organizer: 'River Ward Volunteers',
    location: 'Central Community Post',
    topics: 'CPR, recovery position, when to call for help',
    startDays: 3,
    hours: 2,
    capacity: 40,
  },
  {
    title: 'Flood and landslide safety briefing',
    category: 'flood_landslide_safety',
    organizer: 'City Emergency Management',
    location: 'Library meeting room',
    topics: 'Go-bag, high water, hillside warning signs',
    startDays: 5,
    hours: 2,
    capacity: 80,
  },
  {
    title: 'Volunteer orientation',
    category: 'volunteer_briefing',
    organizer: 'Neighborhood Response Team',
    location: 'Fire station 4',
    topics: 'Roles, check-in, radio basics',
    startDays: 7,
    hours: 3,
    capacity: null,
  },
  {
    title: 'Neighborhood evacuation drill',
    category: 'evacuation_drill',
    organizer: 'Ward 2 Block Captains',
    location: 'Riverside Park field',
    topics: 'Routes, muster point, family reunification',
    startDays: 10,
    hours: 2,
    capacity: 25,
  },
  {
    title: 'Safe water workshop',
    category: 'water_sanitation',
    organizer: 'Health Outreach',
    location: 'Community kitchen',
    topics: 'Boiling, storage, handwashing stations',
    startDays: 12,
    hours: 2,
    capacity: 30,
  },
];

let addedPeople = 0;
let addedPrograms = 0;

try {
  for (const person of people) {
    const inserted = await sql`
      insert into missing_persons (
        name, name_normalized, age, last_seen_location, notes, contact,
        status, reporter_user_id, found_note, found_at, found_by_user_id
      )
      select
        ${person.name}, ${person.nameNormalized}, ${person.age}, ${person.location},
        ${person.notes}, ${person.contact}, ${person.status}, 'seed_demo',
        ${person.foundNote},
        case when ${person.status} = 'found' then now() else null end,
        case when ${person.status} = 'found' then 'seed_demo' else null end
      where not exists (
        select 1 from missing_persons where name = ${person.name}
      )
      returning id
    `;
    if (inserted.length === 0) continue;
    addedPeople += 1;
    await sql`
      insert into missing_person_events (missing_person_id, kind, actor_user_id)
      values (${inserted[0].id}, 'reported', 'seed_demo')
    `;
    if (person.status === 'found') {
      await sql`
        insert into missing_person_events (missing_person_id, kind, actor_user_id, changes)
        values (${inserted[0].id}, 'found', 'seed_demo', ${sql.json({ note: person.foundNote })})
      `;
    }
  }

  for (const program of programs) {
    const inserted = await sql`
      insert into programs (
        title, category, organizer, location, topics, starts_at, ends_at, capacity, created_by_user_id
      )
      select
        ${program.title}, ${program.category}, ${program.organizer}, ${program.location},
        ${program.topics},
        now() + (${program.startDays} * interval '1 day'),
        now() + (${program.startDays} * interval '1 day') + (${program.hours} * interval '1 hour'),
        ${program.capacity}, 'seed_demo'
      where not exists (
        select 1 from programs where title = ${program.title}
      )
      returning id
    `;
    if (inserted.length === 0) continue;
    addedPrograms += 1;
    if (program.capacity !== null) {
      await sql`
        insert into program_registrations (program_id, user_id)
        values (${inserted[0].id}, 'seed_attendee_1')
      `;
    }
  }

  console.log(
    `Kept existing rows. Added ${addedPeople} missing-person records and ${addedPrograms} programs.`,
  );
} finally {
  await sql.end();
}
