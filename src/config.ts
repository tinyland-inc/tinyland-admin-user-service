/**
 * Configuration injection for tinyland-admin-user-service
 *
 * Provides a way to inject external dependencies (file I/O, TOTP functions,
 * bcrypt salt rounds) without coupling to specific implementations.
 *
 * All config values are optional - sensible defaults are used when
 * no configuration is provided. File I/O defaults to Node.js fs.
 * TOTP functions throw "TOTP not configured" if called without config.
 *
 * @module config
 *
 * @example
 * ```typescript
 * import { configure } from '@tummycrypt/tinyland-admin-user-service';
 *
 * configure({
 *   usersFilePath: '/app/content/auth/admin-users.json',
 *   saltRounds: 12,
 *   readFile: async (path) => fs.readFile(path, 'utf-8'),
 *   writeFile: async (path, data) => fs.writeFile(path, data, 'utf-8'),
 * });
 * ```
 */

import type { AdminUserServiceConfig } from './types.js';

let config: AdminUserServiceConfig = {};

/**
 * Configure the admin user service with external dependencies.
 *
 * Call this once at application startup before using the service.
 * Merges with existing configuration (does not replace).
 *
 * @param c - Configuration options to merge
 */
export function configure(c: AdminUserServiceConfig): void {
	config = { ...config, ...c };
}

/**
 * Get current configuration.
 *
 * Returns the raw config object. Defaults for file I/O are applied
 * at the service level, not here.
 *
 * @returns Current merged configuration
 */
export function getConfig(): AdminUserServiceConfig {
	return { ...config };
}

/**
 * Get the configured users file path with default applied.
 */
export function getUsersFilePath(): string {
	return config.usersFilePath ?? process.cwd() + '/content/auth/admin-users.json';
}

/**
 * Get the configured salt rounds with default applied.
 */
export function getSaltRounds(): number {
	return config.saltRounds ?? 10;
}

/**
 * Get the configured file read function.
 * Falls back to Node.js fs.readFile if not configured.
 */
export async function getReadFile(): Promise<(path: string) => Promise<string>> {
	if (config.readFile) {
		return config.readFile;
	}
	const { readFile } = await import('node:fs/promises');
	return (path: string) => readFile(path, 'utf-8');
}

/**
 * Get the configured file write function.
 * Falls back to Node.js fs.writeFile if not configured.
 */
export async function getWriteFile(): Promise<(path: string, data: string) => Promise<void>> {
	if (config.writeFile) {
		return config.writeFile;
	}
	const { writeFile } = await import('node:fs/promises');
	return (path: string, data: string) => writeFile(path, data, 'utf-8');
}

/**
 * Get the configured generateTOTPSecret function.
 * Throws if TOTP is not configured.
 */
export function getGenerateTOTPSecret(): () => string {
	if (!config.generateTOTPSecret) {
		throw new Error('TOTP not configured: generateTOTPSecret is required');
	}
	return config.generateTOTPSecret;
}

/**
 * Get the configured generateTOTPUri function.
 * Throws if TOTP is not configured.
 */
export function getGenerateTOTPUri(): (secret: string, issuer: string, account: string) => string {
	if (!config.generateTOTPUri) {
		throw new Error('TOTP not configured: generateTOTPUri is required');
	}
	return config.generateTOTPUri;
}

/**
 * Get the configured generateTOTPQRCode function.
 * Throws if TOTP is not configured.
 */
export function getGenerateTOTPQRCode(): (uri: string) => Promise<string> {
	if (!config.generateTOTPQRCode) {
		throw new Error('TOTP not configured: generateTOTPQRCode is required');
	}
	return config.generateTOTPQRCode;
}

/**
 * Get the configured generateTempPassword function.
 * Throws if TOTP is not configured.
 */
export function getGenerateTempPassword(): (length: number) => string {
	if (!config.generateTempPassword) {
		throw new Error('TOTP not configured: generateTempPassword is required');
	}
	return config.generateTempPassword;
}

/**
 * Reset all configuration to empty defaults.
 * Primarily useful for testing.
 */
export function resetConfig(): void {
	config = {};
}
