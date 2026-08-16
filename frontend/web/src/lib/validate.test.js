import { expect, it } from 'vitest';
import { isEmail, normalizeMobile } from './validate.js';

// Kept in step with backend/tests/test_phone.py — the two must agree, or the form
// green-lights a number the server then rejects.
it('accepts every spelling of an Egyptian mobile and returns one canonical form', () => {
  for (const written of ['01024527770', '+201024527770', '00201024527770',
    '0102 452 7770', '+20 (010) 2452-7770', '+20010 2452 7770']) {
    expect(normalizeMobile(written)).toBe('+201024527770');
  }
  for (const prefix of ['10', '11', '12', '15']) {
    expect(normalizeMobile(`0${prefix}12345678`)).toBe(`+20${prefix}12345678`);
  }
});

it('accepts Gulf mobiles that carry a country code', () => {
  expect(normalizeMobile('+966512345678')).toBe('+966512345678');
  expect(normalizeMobile('00971501234567')).toBe('+971501234567');
  expect(normalizeMobile('+965 51234567')).toBe('+96551234567');
  expect(normalizeMobile('+974 33123456')).toBe('+97433123456');
  expect(normalizeMobile('+973 36123456')).toBe('+97336123456');
  expect(normalizeMobile('+968 91234567')).toBe('+96891234567');
});

it('rejects landlines, wrong lengths, bare Gulf numbers and junk', () => {
  for (const bad of ['0221234567', '01312345678', '02120674538428', '0512345678',
    '+9665123456', '+9665123456789', '', '   ', 'not a phone', '+', '00', null, 12345]) {
    expect(normalizeMobile(bad)).toBe('');
  }
});

it('checks email shape without rejecting real addresses', () => {
  for (const good of ['ahmeddiab1712@gmail.com', 'a.b+tag@sub.domain.co.uk', ' spaced@example.com ']) {
    expect(isEmail(good)).toBe(true);
  }
  for (const bad of ['', 'no-at-sign', 'a@b', 'a@b.c', 'two@@example.com', 'spaces in@example.com', null]) {
    expect(isEmail(bad)).toBe(false);
  }
});
