let config = {};
export function configure(c) {
    config = { ...config, ...c };
}
export function getConfig() {
    return { ...config };
}
export function getUsersFilePath() {
    return config.usersFilePath ?? process.cwd() + '/content/auth/admin-users.json';
}
export function getSaltRounds() {
    return config.saltRounds ?? 10;
}
export async function getReadFile() {
    if (config.readFile) {
        return config.readFile;
    }
    const { readFile } = await import('node:fs/promises');
    return (path) => readFile(path, 'utf-8');
}
export async function getWriteFile() {
    if (config.writeFile) {
        return config.writeFile;
    }
    const { writeFile } = await import('node:fs/promises');
    return (path, data) => writeFile(path, data, 'utf-8');
}
export function getGenerateTOTPSecret() {
    if (!config.generateTOTPSecret) {
        throw new Error('TOTP not configured: generateTOTPSecret is required');
    }
    return config.generateTOTPSecret;
}
export function getGenerateTOTPUri() {
    if (!config.generateTOTPUri) {
        throw new Error('TOTP not configured: generateTOTPUri is required');
    }
    return config.generateTOTPUri;
}
export function getGenerateTOTPQRCode() {
    if (!config.generateTOTPQRCode) {
        throw new Error('TOTP not configured: generateTOTPQRCode is required');
    }
    return config.generateTOTPQRCode;
}
export function getGenerateTempPassword() {
    if (!config.generateTempPassword) {
        throw new Error('TOTP not configured: generateTempPassword is required');
    }
    return config.generateTempPassword;
}
export function resetConfig() {
    config = {};
}
