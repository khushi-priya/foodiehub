const test = require('node:test');
const assert = require('node:assert/strict');
const { branchIsOpen, branchAvailabilityStatus, reservationFitsBranchHours, localDateTimeToInstant } = require('../src/services/branch-availability');

const branch = {
  isActive: true,
  approvalStatus: 'approved',
  operationalStatus: 'closed', // legacy/default value: operating hours determine availability
  openingTime: '09:00:00',
  closingTime: '22:00:00',
  timeZone: 'Asia/Kolkata',
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  closedDays: [],
  overnight: false,
};

test('branch availability uses branch-local weekday and time for standard hours', () => {
  const mondayAtTenInIndia = new Date('2026-11-16T04:30:00.000Z');
  assert.equal(branchIsOpen(branch, mondayAtTenInIndia), true);
  assert.equal(branchAvailabilityStatus(branch, mondayAtTenInIndia), 'open');
});

test('Asia/Kolkata opening and closing minute boundaries are evaluated in branch time', () => {
  assert.equal(branchIsOpen(branch, new Date('2026-11-16T03:29:59.000Z')), false); // 08:59:59
  assert.equal(branchIsOpen(branch, new Date('2026-11-16T03:30:00.000Z')), true); // 09:00
  assert.equal(branchIsOpen(branch, new Date('2026-11-16T16:29:59.000Z')), true); // 21:59:59
  assert.equal(branchIsOpen(branch, new Date('2026-11-16T16:30:00.000Z')), false); // 22:00
  assert.equal(branchIsOpen({ ...branch, timeZone: 'America/Los_Angeles', workingDays: ['Monday'] }, new Date('2026-11-16T03:30:00.000Z')), false);
});

test('standard hours close after closing time even when the branch is working that day', () => {
  const mondayAtElevenInIndia = new Date('2026-11-16T17:30:00.000Z');
  assert.equal(branchIsOpen(branch, mondayAtElevenInIndia), false);
});

test('overnight hours remain open after midnight when the previous day was a working day', () => {
  const overnight = { ...branch, openingTime: '18:00:00', closingTime: '02:00:00', overnight: true, workingDays: ['Monday'] };
  const tuesdayAtOneInIndia = new Date('2026-11-16T19:30:00.000Z');
  assert.equal(branchIsOpen(overnight, tuesdayAtOneInIndia), true);
});

test('overnight status closes exactly at local closing time and honors the opening weekday', () => {
  const overnight = { ...branch, openingTime: '18:00:00', closingTime: '02:00:00', overnight: true, workingDays: ['Monday'], closedDays: ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] };
  assert.equal(branchIsOpen(overnight, new Date('2026-11-16T20:29:59.000Z')), true); // Tuesday 01:59:59 IST
  assert.equal(branchIsOpen(overnight, new Date('2026-11-16T20:30:00.000Z')), false); // Tuesday 02:00 IST
  assert.equal(branchIsOpen(overnight, new Date('2026-11-17T19:30:00.000Z')), false); // Wednesday 01:00, Tuesday was closed
});

test('closed days stay closed unless the previous working day has an active overnight period', () => {
  const tuesdayAtTenInIndia = new Date('2026-11-17T04:30:00.000Z');
  assert.equal(branchIsOpen({ ...branch, workingDays: ['Monday'] }, tuesdayAtTenInIndia), false);
  assert.equal(branchIsOpen({ ...branch, closedDays: ['Tuesday'] }, tuesdayAtTenInIndia), false);
  assert.equal(branchIsOpen({ ...branch, closedDays: ['Tuesday'], workingDays: undefined }, tuesdayAtTenInIndia), false);
});

test('missing timezone uses the configured India default, while invalid timezone or hours fail closed', () => {
  const mondayAtTenInIndia = new Date('2026-11-16T04:30:00.000Z');
  assert.equal(branchIsOpen({ ...branch, timeZone: null }, mondayAtTenInIndia), true);
  assert.equal(branchIsOpen({ ...branch, timeZone: 'Invalid/Timezone' }, mondayAtTenInIndia), false);
  assert.equal(branchIsOpen({ ...branch, openingTime: null }, mondayAtTenInIndia), false);
});

test('inactive, suspended, and temporarily closed branches are not available', () => {
  const mondayAtTenInIndia = new Date('2026-11-16T04:30:00.000Z');
  assert.equal(branchIsOpen({ ...branch, isActive: false }, mondayAtTenInIndia), false);
  assert.equal(branchIsOpen({ ...branch, approvalStatus: 'suspended' }, mondayAtTenInIndia), false);
  assert.equal(branchIsOpen({ ...branch, operationalStatus: 'temporarily_closed' }, mondayAtTenInIndia), false);
});

test('expired temporary closure is recalculated from schedule; unbounded manual closure remains closed', () => {
  const duringHours = new Date('2026-11-16T04:30:00.000Z');
  assert.equal(branchIsOpen({ ...branch, operationalStatus: 'temporarily_closed', temporaryClosureUntil: '2026-11-16T05:00:00.000Z' }, duringHours), false);
  assert.equal(branchIsOpen({ ...branch, operationalStatus: 'temporarily_closed', temporaryClosureUntil: '2026-11-16T04:00:00.000Z' }, duringHours), true);
  assert.equal(branchIsOpen({ ...branch, operationalStatus: 'temporarily_closed', temporaryClosureUntil: null }, duringHours), false);
  assert.equal(branchAvailabilityStatus({ ...branch, isActive: false }, duringHours), 'closed');
});

test('reservation timestamps from datetime-local are interpreted in the branch timezone', () => {
  assert.equal(localDateTimeToInstant('2026-11-16T10:00', 'Asia/Kolkata').toISOString(), '2026-11-16T04:30:00.000Z');
  assert.equal(localDateTimeToInstant('2026-11-16T10:00:00Z', 'Asia/Kolkata').toISOString(), '2026-11-16T10:00:00.000Z');
});

test('DST gaps are rejected and ambiguous local times resolve to the earlier occurrence', () => {
  assert.throws(() => localDateTimeToInstant('2026-03-29T02:30', 'Europe/Berlin'), /daylight-saving/);
  assert.equal(localDateTimeToInstant('2026-10-25T02:30', 'Europe/Berlin').toISOString(), '2026-10-25T00:30:00.000Z');
  assert.throws(() => localDateTimeToInstant('2026-11-16T10:00', null), /IANA time zone/);
});

test('reservation schedule checks the entire duration and overnight operating day', () => {
  const startAtTen = localDateTimeToInstant('2026-11-16T10:00', 'Asia/Kolkata');
  const sevenPm = localDateTimeToInstant('2026-11-16T19:00', 'Asia/Kolkata');
  const ninePm = localDateTimeToInstant('2026-11-16T21:00', 'Asia/Kolkata');
  assert.equal(reservationFitsBranchHours(branch, startAtTen, new Date(startAtTen.getTime() + 120 * 60000)), true);
  assert.equal(reservationFitsBranchHours(branch, sevenPm, new Date(sevenPm.getTime() + 120 * 60000)), true);
  assert.equal(reservationFitsBranchHours(branch, ninePm, new Date(ninePm.getTime() + 120 * 60000)), false);

  const overnight = { ...branch, openingTime: '18:00:00', closingTime: '02:00:00', overnight: true, workingDays: ['Monday'], closedDays: ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] };
  const oneAmTuesday = localDateTimeToInstant('2026-11-17T01:00', 'Asia/Kolkata');
  const elevenPmMonday = localDateTimeToInstant('2026-11-16T23:00', 'Asia/Kolkata');
  assert.equal(reservationFitsBranchHours(overnight, oneAmTuesday, new Date(oneAmTuesday.getTime() + 60 * 60000)), true);
  assert.equal(reservationFitsBranchHours(overnight, elevenPmMonday, new Date(elevenPmMonday.getTime() + 240 * 60000)), false);
});
