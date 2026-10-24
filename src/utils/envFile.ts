import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

/** Refuse links and special files rather than reading or modifying their targets. */
const assertCredentialFile = (envStat: Stats): void => {
  if (!envStat.isFile() || envStat.nlink !== 1) {
    throw new Error('Credential file must be a regular file with no hard links');
  }
  if (process.getuid && envStat.uid !== process.getuid()) {
    throw new Error('Credential file must be owned by the current user');
  }
};

const checkCredentialPath = (filePath: string): void => {
  try {
    const envStat = lstatSync(filePath);
    if (envStat.isSymbolicLink()) {
      throw new Error('Refusing a symbolic link as a credential file');
    }
    assertCredentialFile(envStat);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

/**
 * Quote a value for safe inclusion in a `.env` line.
 *
 * eBay OAuth tokens look like `v^1.1#i^1#...`; dotenv treats an unquoted `#` as
 * the start of an inline comment, so an unquoted token is truncated to `v^1.1`
 * on the next read — silently breaking authentication. Wrap any value
 * containing `#`, whitespace, or quote characters in quotes so dotenv restores
 * it verbatim.
 *
 * dotenv strips the surrounding quotes but never unescapes inside them, and in
 * double quotes it turns `\n` into a newline. So instead of escaping, pick a
 * quote mark the value does not contain: double quotes unless the value has a
 * `"` or `\`, then single quotes, then backticks.
 *
 * @param envValue - Raw environment value to serialize.
 * @returns A dotenv-safe value string.
 * @throws Error when the value contains all three quote marks and cannot be quoted.
 *
 * @example
 * ```ts
 * const line = `EBAY_USER_REFRESH_TOKEN=${quoteEnvValue(token)}`;
 * ```
 */
export const quoteEnvValue = (envValue: string): string => {
  if (envValue === '' || !/[#\s"'`]/.test(envValue)) {
    return envValue;
  }
  const quoteMark = ['"', "'", '`'].find((candidate) =>
    candidate === '"' ? !/["\\]/.test(envValue) : !envValue.includes(candidate),
  );
  if (quoteMark === undefined) {
    throw new Error('Cannot write a .env value that contains ", \' and ` quote marks');
  }
  return `${quoteMark}${envValue}${quoteMark}`;
};

/**
 * Serialize environment variables into `.env` file content, one `KEY=value` line each.
 *
 * @param env - Environment variables to write, in output order.
 * @returns `.env` file content with every value quoted by {@link quoteEnvValue}.
 *
 * @example
 * ```ts
 * writeFileSync(envPath, stringifyEnv({ EBAY_ENVIRONMENT: 'sandbox' }));
 * ```
 */
export const stringifyEnv = (env: Record<string, string>): string =>
  Object.entries(env)
    .map(([name, envValue]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error('Invalid environment variable name');
      }
      if (envValue.includes('\0')) throw new Error('Environment values cannot contain NUL');
      return `${name}=${quoteEnvValue(envValue)}`;
    })
    .join('\n');
/**
 * Read a private, current-user-owned credential file without following symlinks.
 * Missing files are normal before setup. POSIX permissions are tightened before
 * any secret is read; Windows access remains subject to the directory's ACL.
 */
export const readEnvFileSecure = (filePath: string): Record<string, string> => {
  checkCredentialPath(filePath);
  let descriptor: number;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  try {
    assertCredentialFile(fstatSync(descriptor));
    if (process.platform !== 'win32') fchmodSync(descriptor, 0o600);
    return dotenv.parse(readFileSync(descriptor, 'utf-8'));
  } finally {
    closeSync(descriptor);
  }
};

/**
 * Atomically replace private text (credentials, client JSON or a backup). The sibling
 * temporary file is exclusively created at 0600; readers see the old or new
 * complete content. Renaming never follows a replaced destination symlink.
 */
export const writePrivateTextFileSecure = (filePath: string, content: string): void => {
  checkCredentialPath(filePath);
  const temporaryPath = join(dirname(filePath), `.env-${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    if (process.platform !== 'win32') fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, content, 'utf-8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    checkCredentialPath(filePath);
    renameSync(temporaryPath, filePath);
    // The replacement is committed; directory fsync is best effort on platforms
    // and filesystems that cannot open/sync a directory descriptor.
    let directoryDescriptor: number | undefined;
    try {
      directoryDescriptor = openSync(dirname(filePath), constants.O_RDONLY);
      fsyncSync(directoryDescriptor);
    } catch {
      // File contents were synced before the atomic rename.
    } finally {
      if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporaryPath);
    } catch {
      // A failed cleanup must not mask the original persistence error. Any
      // leftover temporary file was created privately with mode 0600.
    }
  }
};

/** Serialize environment values before atomically replacing their private file. */
export const writeEnvFileSecure = (filePath: string, env: Record<string, string>): void =>
  writePrivateTextFileSecure(filePath, stringifyEnv(env));
