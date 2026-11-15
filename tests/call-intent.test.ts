import { describe, expect, it } from 'vitest';
import { intentOf } from '@/app/sms-simulator/CallSimulator';

describe('CallSimulator intentOf', () => {
  it.each([
    ['No, I want to report my mother', 'report'],
    ['no I am looking for my brother', 'check'],
    ['I want to report someone missing', 'report'],
    ["I can't find my son", 'report'],
    ['Is Maya Rai on the list?', 'check'],
    ['I am seeking my father', 'check'],
    ['no', 'end'],
    ['No.', 'end'],
    ['bye', 'end'],
    ['no thanks', 'end'],
    ["that's all, thank you", 'end'],
    ['nothing else', 'end'],
    ["No, that's all", 'end'],
    ['no thank you, bye', 'end'],
    ['Maya Rai', null],
    ['nobody told me anything', null],
  ])('%j -> %s', (text, intent) => {
    expect(intentOf(text)).toBe(intent);
  });
});
