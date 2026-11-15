import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  destinationAfterAuth,
  passwordProblem,
  splitName,
  toIdentifier,
  validateSignUp,
  type SignUpValues,
} from '@/lib/auth-forms';

vi.mock('@clerk/nextjs', () => ({
  useSignIn: () => ({
    signIn: { password: async () => ({ error: null }), status: 'needs_identifier' },
  }),
  useSignUp: () => ({
    signUp: { password: async () => ({ error: null }), status: 'missing_requirements' },
  }),
}));

import SignInPage from '@/app/sign-in/[[...sign-in]]/page';
import SignUpPage from '@/app/sign-up/[[...sign-up]]/page';

const origin = 'http://localhost:3000';

const validSignUp: SignUpValues = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '202-555-0123',
  password: 'correct1',
  confirmPassword: 'correct1',
  consent: true,
};

describe('Clerk identifier and return path', () => {
  it('accepts an email and a US phone, and rejects anything else', () => {
    expect(toIdentifier('  ada@example.com ')).toBe('ada@example.com');
    expect(toIdentifier('ada@')).toBeNull();
    expect(toIdentifier('not-an-email')).toBeNull();
    expect(toIdentifier('(202) 555-0123')).toBe('+12025550123');
    expect(toIdentifier('+44 20 7946 0958')).toBeNull();
  });

  it('requires a password of 8 characters with a letter and a number', () => {
    expect(passwordProblem('short1')).toMatch(/8/);
    expect(passwordProblem('longpassword')).toMatch(/letter/);
    expect(passwordProblem('longpass1')).toBeUndefined();
  });

  it('checks every sign-up field and splits the name for Clerk', () => {
    expect(validateSignUp(validSignUp)).toEqual({});
    expect(validateSignUp({ ...validSignUp, consent: false }).consent).toMatch(/agree/i);
    expect(validateSignUp({ ...validSignUp, confirmPassword: 'other1' }).confirmPassword).toMatch(
      /match/i,
    );
    expect(splitName('Ada Lovelace King')).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace King',
    });
  });

  it('returns to the requested same-origin page, otherwise the dashboard', () => {
    expect(destinationAfterAuth('', origin)).toBe('/dashboard');
    expect(destinationAfterAuth('?redirect_url=%2Fmissing%3Fx%3D1', origin)).toBe('/missing?x=1');
    expect(destinationAfterAuth('?redirect_url=https%3A%2F%2Fevil.example%2Fmissing', origin)).toBe(
      '/dashboard',
    );
    expect(destinationAfterAuth('?redirect_url=%2Fsign-in', origin)).toBe('/dashboard');
    expect(destinationAfterAuth('?redirect_url=%2F', origin)).toBe('/dashboard');
  });
});

describe('Clerk sign-in and sign-up pages', () => {
  it('offers sign-in and a way to create an account', () => {
    const html = renderToStaticMarkup(createElement(SignInPage));

    expect(html).toContain('FLOOD RESPONSE');
    expect(html).toContain('SIGN IN');
    expect(html).toContain('href="/sign-up"');
  });

  it('offers account creation and a way back to sign-in', () => {
    const html = renderToStaticMarkup(createElement(SignUpPage));

    expect(html).toContain('CREATE ACCOUNT');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('id="clerk-captcha"');
  });
});
