
























import type { AdminUserServiceConfig } from './types.js';

let config: AdminUserServiceConfig = {};









export function configure(c: AdminUserServiceConfig): void {
	config = { ...config, ...c };
}









export function getConfig(): AdminUserServiceConfig {
	return { ...config };
}




export function getUsersFilePath(): string {
	return config.usersFilePath ?? process.cwd() + '/content/auth/admin-users.json';
}




export function getSaltRounds(): number {
	return config.saltRounds ?? 10;
}





export async function getReadFile(): Promise<(path: string) => Promise<string>> {
	if (config.readFile) {
		return config.readFile;
	}
	const { readFile } = await import('node:fs/promises');
	return (path: string) => readFile(path, 'utf-8');
}





export async function getWriteFile(): Promise<(path: string, data: string) => Promise<void>> {
	if (config.writeFile) {
		return config.writeFile;
	}
	const { writeFile } = await import('node:fs/promises');
	return (path: string, data: string) => writeFile(path, data, 'utf-8');
}





export function getGenerateTOTPSecret(): () => string {
	if (!config.generateTOTPSecret) {
		throw new Error('TOTP not configured: generateTOTPSecret is required');
	}
	return config.generateTOTPSecret;
}





export function getGenerateTOTPUri(): (secret: string, issuer: string, account: string) => string {
	if (!config.generateTOTPUri) {
		throw new Error('TOTP not configured: generateTOTPUri is required');
	}
	return config.generateTOTPUri;
}





export function getGenerateTOTPQRCode(): (uri: string) => Promise<string> {
	if (!config.generateTOTPQRCode) {
		throw new Error('TOTP not configured: generateTOTPQRCode is required');
	}
	return config.generateTOTPQRCode;
}





export function getGenerateTempPassword(): (length: number) => string {
	if (!config.generateTempPassword) {
		throw new Error('TOTP not configured: generateTempPassword is required');
	}
	return config.generateTempPassword;
}





export function resetConfig(): void {
	config = {};
}
