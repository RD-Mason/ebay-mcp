/**
 * Unit tests for the `.env` serialization helpers in `envFile`.
 *
 * The regression these guard against: eBay OAuth tokens look like
 * `v^1.1#i^1#...`, and dotenv treats an unquoted `#` as the start of an inline
 * comment. An unquoted token is therefore truncated to `v^1.1` on the next
 * read, silently breaking authentication (`invalid_grant — the provided
 * authorization refresh token is invalid or was issued to another client`).
 */

import dotenv from 'dotenv';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quoteEnvValue, stringifyEnv, writePrivateTextFileSecure } from '@/utils/envFile.js';

const SAMPLE_REFRESH_TOKEN = 'v^1.1#i^1#I^3#r^1#p^3#f^0#t^Ul41Xz==';

describe('private text file writes', () => {
  it('writes client JSON privately and tightens permissive existing files', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'ebay-private-json-'));
    const configPath = join(temporaryDirectory, 'client.json');
    try {
      const content = JSON.stringify({ mcpServers: { ebay: { command: '/validated/node' } } });
      writePrivateTextFileSecure(configPath, content);
      expect(readFileSync(configPath, 'utf-8')).toBe(content);
      if (process.platform !== 'win32') {
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
        chmodSync(configPath, 0o644);
        writePrivateTextFileSecure(configPath, content);
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
      }
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')(
    'rejects linked client configs without touching the target',
    () => {
      const temporaryDirectory = mkdtempSync(join(tmpdir(), 'ebay-private-json-link-'));
      const targetPath = join(temporaryDirectory, 'unrelated.json');
      const configPath = join(temporaryDirectory, 'client.json');
      try {
        writeFileSync(targetPath, '{"preserve":true}', { mode: 0o644 });
        symlinkSync(targetPath, configPath);
        expect(() => writePrivateTextFileSecure(configPath, '{}')).toThrow('symbolic link');
        expect(readFileSync(targetPath, 'utf-8')).toBe('{"preserve":true}');
        expect(statSync(targetPath).mode & 0o777).toBe(0o644);
      } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    },
  );
});

describe('quoteEnvValue', () => {
  it('quotes a token containing # so dotenv does not treat it as a comment', () => {
    const line = `EBAY_USER_REFRESH_TOKEN=${quoteEnvValue(SAMPLE_REFRESH_TOKEN)}`;
    const parsed = dotenv.parse(line);

    expect(parsed.EBAY_USER_REFRESH_TOKEN).toBe(SAMPLE_REFRESH_TOKEN);
  });

  it('truncates at # when NOT quoted (documents the bug being prevented)', () => {
    const parsed = dotenv.parse(`EBAY_USER_REFRESH_TOKEN=${SAMPLE_REFRESH_TOKEN}`);

    expect(parsed.EBAY_USER_REFRESH_TOKEN).toBe('v^1.1');
  });

  it('leaves plain values unquoted', () => {
    expect(quoteEnvValue('sandbox')).toBe('sandbox');
    expect(quoteEnvValue('EBAY_US')).toBe('EBAY_US');
    expect(quoteEnvValue('')).toBe('');
  });

  it('quotes whitespace values with double quotes', () => {
    expect(quoteEnvValue('a b')).toBe('"a b"');
  });

  it.each([
    ['an embedded double quote', 'say "hi" #1'],
    ['a backslash', 'C:\\new folder'],
    ['a literal backslash-n', 'line\\nbreak #x'],
    ['a single quote', "it's #1"],
    ['double and single quotes', `a"b'c #d`],
    ['a trailing backslash', 'ends with \\'],
  ])('round-trips a value with %s through dotenv', (_label, envValue) => {
    const parsed = dotenv.parse(`SECRET=${quoteEnvValue(envValue)}`);

    expect(parsed.SECRET).toBe(envValue);
  });

  it('throws instead of corrupting a value that contains every quote mark', () => {
    expect(() => quoteEnvValue(`a"b'c\`d`)).toThrow('quote marks');
  });
});

describe('stringifyEnv', () => {
  it.each([
    'TOKEN\nNODE_OPTIONS',
    'TOKEN=OTHER',
    'TOKEN\rOTHER',
  ])('rejects an injected key %s', (name) => {
    expect(() => stringifyEnv({ [name]: 'value' })).toThrow('Invalid environment variable name');
  });

  it('keeps quoted newline content in one value without introducing configuration', () => {
    const maliciousValue = 'secret\nEBAY_READ_ONLY=false\nNODE_OPTIONS=--inspect';
    expect(dotenv.parse(stringifyEnv({ TOKEN: maliciousValue }))).toEqual({
      TOKEN: maliciousValue,
    });
  });

  it('rejects NUL instead of writing a value a reader may interpret differently', () => {
    expect(() => stringifyEnv({ TOKEN: 'part\0suffix' })).toThrow('cannot contain NUL');
  });

  it('writes one KEY=value line per entry that dotenv reads back verbatim', () => {
    const env = {
      EBAY_ENVIRONMENT: 'sandbox',
      EBAY_USER_REFRESH_TOKEN: SAMPLE_REFRESH_TOKEN,
      EBAY_REDIRECT_URI: 'Your App Name-YourApp-SBX-abc',
    };

    const content = stringifyEnv(env);

    expect(content.split('\n')).toHaveLength(3);
    expect(dotenv.parse(content)).toEqual(env);
  });

  it('returns an empty string for an empty env', () => {
    expect(stringifyEnv({})).toBe('');
  });
});
