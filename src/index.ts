/**
 * @tummycrypt/tinyland-admin-user-service
 *
 * Admin user lifecycle management with in-memory caching and file persistence.
 * Provides dependency injection for file I/O, TOTP, and password hashing.
 *
 * @packageDocumentation
 */

export type {
	AdminUser,
	CreateUserData,
	CreateUserResult,
	AdminUserServiceConfig,
} from './types.js';

export {
	configure,
	getConfig,
	getUsersFilePath,
	getSaltRounds,
	resetConfig,
} from './config.js';

export {
	AdminUserService,
	adminUserService,
} from './service.js';
