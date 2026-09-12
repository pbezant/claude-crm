import test from 'node:test';
import assert from 'node:assert/strict';

import { dateAfterDays, localDate } from '../md-record.mjs';

test('calendar dates use the local day instead of the UTC day', () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  try {
    assert.equal(localDate(new Date('2026-09-12T00:30:00Z')), '2026-09-11');
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});

test('date offsets use calendar days across daylight-saving changes', () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  try {
    assert.equal(dateAfterDays(1, new Date('2026-03-08T07:30:00Z')), '2026-03-09');
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});
