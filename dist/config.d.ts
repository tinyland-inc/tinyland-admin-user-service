import type { AdminUserServiceConfig } from './types.js';
export declare function configure(c: AdminUserServiceConfig): void;
export declare function getConfig(): AdminUserServiceConfig;
export declare function getUsersFilePath(): string;
export declare function getSaltRounds(): number;
export declare function getReadFile(): Promise<(path: string) => Promise<string>>;
export declare function getWriteFile(): Promise<(path: string, data: string) => Promise<void>>;
export declare function getGenerateTOTPSecret(): () => string;
export declare function getGenerateTOTPUri(): (secret: string, issuer: string, account: string) => string;
export declare function getGenerateTOTPQRCode(): (uri: string) => Promise<string>;
export declare function getGenerateTempPassword(): (length: number) => string;
export declare function resetConfig(): void;
//# sourceMappingURL=config.d.ts.map