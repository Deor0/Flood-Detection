import { describe, expect, it } from 'vitest';
import {
  editDistance,
  normalizeBody,
  parseCommand,
  parseMissingArgs,
  readPublicId,
} from '@/core/sms/parse';
import { findStatusPlace, statusReply } from '@/core/sms/status';

describe('parseCommand', () => {
  it.each([
    ['SEARCH Maya Rai', 'SEARCH', 'Maya Rai'],
    ['search maya', 'SEARCH', 'maya'],
    ['SEARCH: Maya', 'SEARCH', 'Maya'],
    ['Search - Maya Rai', 'SEARCH', 'Maya Rai'],
    ['SEARCH,Maya', 'SEARCH', 'Maya'],
    ['FIND Maya', 'SEARCH', 'Maya'],
    ['khoj Maya', 'SEARCH', 'Maya'],
    ['SERCH Maya', 'SEARCH', 'Maya'],
    ['SAERCH Maya', 'SEARCH', 'Maya'],
    ['LOST Maya Rai, Rasuwa', 'MISSING', 'Maya Rai, Rasuwa'],
    ['HARAYO Maya', 'MISSING', 'Maya'],
    ['MISING Maya', 'MISSING', 'Maya'],
    ['missing: Maya, Rasuwa, 34', 'MISSING', 'Maya, Rasuwa, 34'],
    ['SAFE Maya', 'FOUND', 'Maya'],
    ['BHETIYO Maya', 'FOUND', 'Maya'],
    ['FOUN Maya', 'FOUND', 'Maya'],
    ['FOUND REG-01001', 'FOUND', 'REG-01001'],
    ['STATSU Kathmandu', 'STATUS', 'Kathmandu'],
    ['status kathmandu', 'STATUS', 'kathmandu'],
    ['help', 'HELP', ''],
    ['HELP!', 'HELP', ''],
    ['', 'HELP', ''],
    ['?', 'HELP', ''],
  ])('%j -> %s %j', (body, command, args) => {
    expect(parseCommand(body)).toEqual({ command, args });
  });

  it.each(['Maya Rai', 'hello there', 'XYZ', '123', 'SEARCHING Maya'])('%j is unknown', (body) => {
    expect(parseCommand(body).command).toBe('UNKNOWN');
  });
});

describe('parseMissingArgs', () => {
  it.each([
    ['Maya Rai, Rasuwa, 34', { name: 'Maya Rai', place: 'Rasuwa', age: 34 }],
    ['Maya Rai', { name: 'Maya Rai', place: '', age: null }],
    ['Maya Rai, Rasuwa', { name: 'Maya Rai', place: 'Rasuwa', age: null }],
    ['Maya Rai, 34', { name: 'Maya Rai', place: '', age: 34 }],
    ['Maya Rai, 34 yrs', { name: 'Maya Rai', place: '', age: 34 }],
    ['Maya Rai, Rasuwa, about 30', { name: 'Maya Rai', place: 'Rasuwa', age: 30 }],
    ['Maya Rai, Rasuwa, unknown', { name: 'Maya Rai', place: 'Rasuwa', age: null }],
    ['Maya Rai, Rasuwa, 999', { name: 'Maya Rai', place: 'Rasuwa', age: null }],
    ['Maya Rai, Rasuwa, thirty', { name: 'Maya Rai', place: 'Rasuwa', age: null }],
    ['Maya Rai, Ward 4, Rasuwa, 34', { name: 'Maya Rai', place: 'Ward 4, Rasuwa', age: 34 }],
    [
      'Maya Rai, Ward 4, Rasuwa, Nepal',
      { name: 'Maya Rai', place: 'Ward 4, Rasuwa, Nepal', age: null },
    ],
    ['  Maya   Rai ,, ', { name: 'Maya Rai', place: '', age: null }],
  ])('%j', (args, expected) => {
    expect(parseMissingArgs(args)).toEqual(expected);
  });
});

describe('helpers', () => {
  it.each([
    ['REG-01001', 1001],
    ['reg 1001', 1001],
    ['REG01001', 1001],
    ['Maya', null],
    ['REG-', null],
  ])('readPublicId(%j) = %j', (text, n) => {
    expect(readPublicId(text)).toBe(n);
  });

  it('edit distance counts a swap as one', () => {
    expect(editDistance('SAERCH', 'SEARCH')).toBe(1);
    expect(editDistance('FOUND', 'FOUND')).toBe(0);
    expect(editDistance('HELLO', 'HELP')).toBe(2);
  });

  it('normalizes bodies for duplicate checks', () => {
    expect(normalizeBody('  missing  Maya Rai. ')).toBe(normalizeBody('MISSING Maya Rai'));
  });
});

describe('STATUS from saved river data', () => {
  it.each([
    ['Kathmandu', 'bagmati-kathmandu'],
    ['KTM', 'bagmati-kathmandu'],
    ['Rasuwa', 'trishuli-rasuwa'],
    ['St Louis', 'mississippi-st-louis'],
    ['Cologne', 'rhine-cologne'],
    ['Sukkur', 'indus-sukkur'],
  ])('%j -> %s', (q, slug) => {
    expect(findStatusPlace(q)?.slug).toBe(slug);
  });

  it('does not match on a stop word alone', () => {
    expect(findStatusPlace('St')).toBeNull();
    expect(findStatusPlace('Pokhara')).toBeNull();
  });

  it('answers with a labelled simulation for a known place', () => {
    const reply = statusReply('Kathmandu');
    expect(reply).toMatch(/^SIMULATION/);
    expect(reply).toMatch(/not an official forecast/i);
    expect(reply).toMatch(/Bagmati, Kathmandu/);
    expect(reply).toMatch(/NORMAL|WATCH|WARNING|SEVERE/);
    expect(reply).toMatch(/m3\/s/);
    expect(reply).toMatch(/higher ground/);
    expect(reply.length).toBeLessThanOrEqual(320);
    expect(reply).not.toMatch(/web flood desk/);
  });

  it('says clearly when it has no data for a place', () => {
    const reply = statusReply('Pokhara');
    expect(reply).toMatch(/No river data for Pokhara/);
    expect(reply).toMatch(/higher ground/);
    expect(reply.length).toBeLessThanOrEqual(320);
  });

  it('asks for a place when none is given', () => {
    expect(statusReply('')).toMatch(/Send STATUS <place>/);
  });
});
