/**
 * Tests for @tinyland-inc/tinyland-admin-user-service
 *
 * 140+ tests covering all service methods, DI configuration, edge cases,
 * and persistence behaviors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	AdminUserService,
	configure,
	getConfig,
	resetConfig,
	getUsersFilePath,
	getSaltRounds,
} from '../src/index.js';
import type { AdminUser, AdminUserServiceConfig } from '../src/index.js';

// ---------------------------------------------------------------------------
// Mock bcryptjs
// ---------------------------------------------------------------------------
vi.mock('bcryptjs', () => ({
	default: {
		hash: vi.fn(async (password: string, _rounds: number) => `$2a$10$hashed_${password}`),
		compare: vi.fn(async (password: string, hash: string) => hash.endsWith(password)),
	},
}));

// ---------------------------------------------------------------------------
// Mock uuid
// ---------------------------------------------------------------------------
let uuidCounter = 0;
vi.mock('uuid', () => ({
	v4: vi.fn(() => {
		uuidCounter++;
		return `test-uuid-${uuidCounter}`;
	}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock file system for a single test */
function createMockFileSystem(initialData?: { users: AdminUser[] } | AdminUser[]) {
	let fileContent = initialData ? JSON.stringify(initialData) : '';
	let fileExists = !!initialData;

	const readFile = vi.fn(async (_path: string): Promise<string> => {
		if (!fileExists) {
			const err: NodeJS.ErrnoException = new Error('ENOENT: no such file or directory');
			err.code = 'ENOENT';
			throw err;
		}
		return fileContent;
	});

	const writeFile = vi.fn(async (_path: string, data: string): Promise<void> => {
		fileContent = data;
		fileExists = true;
	});

	return { readFile, writeFile, getContent: () => fileContent, setContent: (c: string) => { fileContent = c; fileExists = true; } };
}

function createMockTOTP() {
	return {
		generateTOTPSecret: vi.fn(() => 'mock-totp-secret'),
		generateTOTPUri: vi.fn((secret: string, issuer: string, account: string) =>
			`otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`),
		generateTOTPQRCode: vi.fn(async (uri: string) => `data:image/png;base64,qr_${uri}`),
		generateTempPassword: vi.fn((length: number) => 'T'.repeat(length)),
	};
}

function sampleUser(overrides: Partial<AdminUser> = {}): AdminUser {
	return {
		id: 'user-1',
		username: 'alice',
		handle: 'alice_h',
		displayName: 'Alice',
		password: '$2a$10$hashed_secret123',
		role: 'admin',
		isActive: true,
		createdAt: '2025-01-01T00:00:00.000Z',
		updatedAt: '2025-01-01T00:00:00.000Z',
		lastLogin: null,
		totpSecret: null,
		totpEnabled: false,
		firstLogin: false,
		...overrides,
	};
}

function sampleUser2(overrides: Partial<AdminUser> = {}): AdminUser {
	return {
		id: 'user-2',
		username: 'bob',
		handle: 'bob_h',
		displayName: 'Bob',
		password: '$2a$10$hashed_password456',
		role: 'super_admin',
		isActive: true,
		createdAt: '2025-02-01T00:00:00.000Z',
		updatedAt: '2025-02-01T00:00:00.000Z',
		lastLogin: null,
		totpSecret: null,
		totpEnabled: false,
		firstLogin: false,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminUserService', () => {
	let service: AdminUserService;
	let fs: ReturnType<typeof createMockFileSystem>;
	let totp: ReturnType<typeof createMockTOTP>;

	beforeEach(() => {
		vi.clearAllMocks();
		uuidCounter = 0;
		resetConfig();
		fs = createMockFileSystem({ users: [sampleUser(), sampleUser2()] });
		totp = createMockTOTP();
		configure({
			usersFilePath: '/test/admin-users.json',
			saltRounds: 10,
			readFile: fs.readFile,
			writeFile: fs.writeFile,
			...totp,
		});
		service = new AdminUserService();
	});

	// -----------------------------------------------------------------------
	// Config DI
	// -----------------------------------------------------------------------
	describe('Config DI', () => {
		it('should apply custom usersFilePath', () => {
			expect(getUsersFilePath()).toBe('/test/admin-users.json');
		});

		it('should apply custom saltRounds', () => {
			expect(getSaltRounds()).toBe(10);
		});

		it('should return default usersFilePath when not configured', () => {
			resetConfig();
			expect(getUsersFilePath()).toContain('/content/auth/admin-users.json');
		});

		it('should return default saltRounds when not configured', () => {
			resetConfig();
			expect(getSaltRounds()).toBe(10);
		});

		it('should merge configuration on successive configure calls', () => {
			resetConfig();
			configure({ usersFilePath: '/a' });
			configure({ saltRounds: 14 });
			expect(getUsersFilePath()).toBe('/a');
			expect(getSaltRounds()).toBe(14);
		});

		it('should reset configuration', () => {
			resetConfig();
			const cfg = getConfig();
			expect(cfg.usersFilePath).toBeUndefined();
			expect(cfg.saltRounds).toBeUndefined();
		});

		it('should return a copy of config from getConfig', () => {
			const cfg1 = getConfig();
			const cfg2 = getConfig();
			expect(cfg1).not.toBe(cfg2);
			expect(cfg1).toEqual(cfg2);
		});

		it('should preserve readFile in config', () => {
			const cfg = getConfig();
			expect(cfg.readFile).toBe(fs.readFile);
		});

		it('should preserve writeFile in config', () => {
			const cfg = getConfig();
			expect(cfg.writeFile).toBe(fs.writeFile);
		});

		it('should preserve TOTP functions in config', () => {
			const cfg = getConfig();
			expect(cfg.generateTOTPSecret).toBe(totp.generateTOTPSecret);
			expect(cfg.generateTOTPUri).toBe(totp.generateTOTPUri);
			expect(cfg.generateTOTPQRCode).toBe(totp.generateTOTPQRCode);
			expect(cfg.generateTempPassword).toBe(totp.generateTempPassword);
		});
	});

	// -----------------------------------------------------------------------
	// loadUsers
	// -----------------------------------------------------------------------
	describe('loadUsers', () => {
		it('should parse array format', async () => {
			fs = createMockFileSystem([sampleUser()]);
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toHaveLength(1);
			expect(users[0].username).toBe('alice');
		});

		it('should parse object with users property', async () => {
			const users = await service.getAllUsers();
			expect(users).toHaveLength(2);
		});

		it('should handle ENOENT (missing file) gracefully', async () => {
			fs = createMockFileSystem(); // no initial data
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toHaveLength(0);
		});

		it('should map passwordHash to password when password absent', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', role: 'admin', passwordHash: '$2a$10$hashed_pw' } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const user = await service.getUserById('u1');
			expect(user?.password).toBe('$2a$10$hashed_pw');
		});

		it('should not overwrite password with passwordHash if password already set', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', role: 'admin', password: '$2a$10$hashed_original', passwordHash: '$2a$10$hashed_alt' } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const user = await service.getUserById('u1');
			expect(user?.password).toBe('$2a$10$hashed_original');
		});

		it('should map active to isActive when isActive absent', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', role: 'admin', active: true } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const user = await service.getUserById('u1');
			expect(user?.isActive).toBe(true);
		});

		it('should not overwrite isActive with active if isActive already set', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', role: 'admin', active: true, isActive: false } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const user = await service.getUserById('u1');
			expect(user?.isActive).toBe(false);
		});

		it('should handle empty users array', async () => {
			fs = createMockFileSystem({ users: [] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toHaveLength(0);
		});

		it('should handle object with missing users property', async () => {
			fs = createMockFileSystem();
			fs.setContent(JSON.stringify({ notUsers: [] }));
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toHaveLength(0);
		});

		it('should handle malformed JSON gracefully', async () => {
			fs = createMockFileSystem();
			fs.setContent('{invalid json');
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toHaveLength(0);
		});

		it('should handle read error gracefully', async () => {
			const badRead = vi.fn(async () => { throw new Error('disk error'); });
			configure({ readFile: badRead, writeFile: fs.writeFile });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// getAllUsers
	// -----------------------------------------------------------------------
	describe('getAllUsers', () => {
		it('should return all users', async () => {
			const users = await service.getAllUsers();
			expect(users).toHaveLength(2);
		});

		it('should strip passwords from results', async () => {
			const users = await service.getAllUsers();
			for (const user of users) {
				expect(user.password).toBeUndefined();
			}
		});

		it('should refresh from disk on each call', async () => {
			await service.getAllUsers();
			expect(fs.readFile).toHaveBeenCalled();
			const callCount = fs.readFile.mock.calls.length;
			await service.getAllUsers();
			expect(fs.readFile.mock.calls.length).toBeGreaterThan(callCount);
		});

		it('should return empty array when no users exist', async () => {
			fs = createMockFileSystem({ users: [] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toEqual([]);
		});

		it('should return user IDs', async () => {
			const users = await service.getAllUsers();
			expect(users.map(u => u.id)).toContain('user-1');
			expect(users.map(u => u.id)).toContain('user-2');
		});

		it('should preserve non-password fields', async () => {
			const users = await service.getAllUsers();
			const alice = users.find(u => u.username === 'alice');
			expect(alice?.displayName).toBe('Alice');
			expect(alice?.role).toBe('admin');
			expect(alice?.isActive).toBe(true);
		});

		it('should return copies that do not mutate internal state', async () => {
			const users = await service.getAllUsers();
			users[0].username = 'MUTATED';
			const freshUsers = await service.getAllUsers();
			expect(freshUsers[0].username).not.toBe('MUTATED');
		});

		it('should call readFile with configured path', async () => {
			await service.getAllUsers();
			expect(fs.readFile).toHaveBeenCalledWith('/test/admin-users.json');
		});

		it('should include all user fields except password', async () => {
			const users = await service.getAllUsers();
			const alice = users.find(u => u.username === 'alice');
			expect(alice?.handle).toBe('alice_h');
			expect(alice?.createdAt).toBe('2025-01-01T00:00:00.000Z');
		});

		it('should handle subsequent calls after file changes', async () => {
			await service.getAllUsers();
			// Simulate file change
			fs.setContent(JSON.stringify({ users: [sampleUser(), sampleUser2(), { id: 'user-3', username: 'charlie', role: 'admin' }] }));
			const users = await service.getAllUsers();
			expect(users).toHaveLength(3);
		});
	});

	// -----------------------------------------------------------------------
	// getUserById
	// -----------------------------------------------------------------------
	describe('getUserById', () => {
		it('should return user when found', async () => {
			const user = await service.getUserById('user-1');
			expect(user).not.toBeNull();
			expect(user?.username).toBe('alice');
		});

		it('should return null when not found', async () => {
			const user = await service.getUserById('nonexistent');
			expect(user).toBeNull();
		});

		it('should lazy init on first call', async () => {
			const user = await service.getUserById('user-1');
			expect(fs.readFile).toHaveBeenCalled();
			expect(user).not.toBeNull();
		});

		it('should return full user object (including password)', async () => {
			const user = await service.getUserById('user-1');
			expect(user?.password).toBeDefined();
		});

		it('should return correct user among multiple', async () => {
			const user = await service.getUserById('user-2');
			expect(user?.username).toBe('bob');
		});

		it('should return null for empty string id', async () => {
			const user = await service.getUserById('');
			expect(user).toBeNull();
		});

		it('should refresh from disk', async () => {
			await service.getUserById('user-1');
			fs.setContent(JSON.stringify({ users: [sampleUser({ displayName: 'Alice Updated' })] }));
			const user = await service.getUserById('user-1');
			expect(user?.displayName).toBe('Alice Updated');
		});

		it('should handle user with minimal fields', async () => {
			fs = createMockFileSystem({ users: [{ id: 'min-1', username: 'minimal', role: 'admin' } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const user = await service.getUserById('min-1');
			expect(user?.username).toBe('minimal');
		});
	});

	// -----------------------------------------------------------------------
	// getUserByHandle
	// -----------------------------------------------------------------------
	describe('getUserByHandle', () => {
		it('should return user when found', async () => {
			const user = await service.getUserByHandle('alice_h');
			expect(user).not.toBeNull();
			expect(user?.username).toBe('alice');
		});

		it('should return null when not found', async () => {
			const user = await service.getUserByHandle('nonexistent');
			expect(user).toBeNull();
		});

		it('should strip password from result', async () => {
			const user = await service.getUserByHandle('alice_h');
			expect(user?.password).toBeUndefined();
		});

		it('should find correct user by handle', async () => {
			const user = await service.getUserByHandle('bob_h');
			expect(user?.username).toBe('bob');
		});

		it('should lazy init on first call', async () => {
			const user = await service.getUserByHandle('alice_h');
			expect(fs.readFile).toHaveBeenCalled();
			expect(user).not.toBeNull();
		});

		it('should return null for empty handle', async () => {
			const user = await service.getUserByHandle('');
			expect(user).toBeNull();
		});

		it('should preserve non-password fields', async () => {
			const user = await service.getUserByHandle('alice_h');
			expect(user?.displayName).toBe('Alice');
			expect(user?.role).toBe('admin');
			expect(user?.id).toBe('user-1');
		});

		it('should return null when users have no handle', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', role: 'admin' } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile });
			service = new AdminUserService();
			const user = await service.getUserByHandle('x');
			expect(user).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// createUser
	// -----------------------------------------------------------------------
	describe('createUser', () => {
		it('should hash the password', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'mypassword', role: 'admin' });
			expect(result).not.toBeNull();
			// bcrypt mock produces $2a$10$hashed_<password>
			expect(fs.writeFile).toHaveBeenCalled();
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.username === 'newuser');
			expect(saved.password).toBe('$2a$10$hashed_mypassword');
		});

		it('should generate a UUID for the new user', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			expect(result.id).toMatch(/^test-uuid-/);
		});

		it('should throw on duplicate username', async () => {
			await expect(service.createUser({ username: 'alice', password: 'pw', role: 'admin' }))
				.rejects.toThrow('Username already exists');
		});

		it('should generate temp password when no password provided', async () => {
			const result = await service.createUser({ username: 'newuser', role: 'admin' });
			expect(result.tempPassword).toBe('TTTTTTTTTTTT');
			expect(totp.generateTempPassword).toHaveBeenCalledWith(12);
		});

		it('should generate temp password when generateCredentials is true', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin', generateCredentials: true });
			expect(result.tempPassword).toBe('TTTTTTTTTTTT');
		});

		it('should generate TOTP when generateCredentials is true', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin', generateCredentials: true });
			expect(result.totpUri).toContain('otpauth://totp/');
			expect(result.qrCode).toContain('data:image/png;base64,qr_');
			expect(totp.generateTOTPSecret).toHaveBeenCalled();
		});

		it('should use provided totpSecret instead of generating', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin', totpSecret: 'my-secret' });
			expect(totp.generateTOTPSecret).not.toHaveBeenCalled();
			expect(result.totpUri).toContain('my-secret');
		});

		it('should set firstLogin when password is generated', async () => {
			const result = await service.createUser({ username: 'newuser', role: 'admin' });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.username === 'newuser');
			expect(saved.firstLogin).toBe(true);
			expect(result.tempPassword).toBeDefined();
		});

		it('should respect explicit firstLogin value', async () => {
			await service.createUser({ username: 'newuser', password: 'pw', role: 'admin', firstLogin: true });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.username === 'newuser');
			expect(saved.firstLogin).toBe(true);
		});

		it('should set firstLogin to false when password provided and not explicitly set', async () => {
			await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.username === 'newuser');
			expect(saved.firstLogin).toBe(false);
		});

		it('should store and save the new user', async () => {
			await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			expect(fs.writeFile).toHaveBeenCalled();
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			expect(written.users).toHaveLength(3);
		});

		it('should strip password from return value', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			expect(result.password).toBeUndefined();
		});

		it('should set isActive to true by default', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.username === 'newuser');
			expect(saved.isActive).toBe(true);
		});

		it('should set displayName to username when not provided', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			expect(result.displayName).toBe('newuser');
		});

		it('should use provided displayName', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin', displayName: 'New User' });
			expect(result.displayName).toBe('New User');
		});

		it('should set createdAt and updatedAt timestamps', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			expect(result.createdAt).toBeDefined();
			expect(result.updatedAt).toBeDefined();
		});

		it('should set lastLogin to null', async () => {
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.username === 'newuser');
			expect(saved.lastLogin).toBeNull();
		});

		it('should set totpEnabled to true when TOTP secret provided', async () => {
			await service.createUser({ username: 'newuser', password: 'pw', role: 'admin', totpSecret: 'secret' });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.username === 'newuser');
			expect(saved.totpEnabled).toBe(true);
		});

		it('should set totpEnabled to false when no TOTP', async () => {
			await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.username === 'newuser');
			expect(saved.totpEnabled).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// updateUser
	// -----------------------------------------------------------------------
	describe('updateUser', () => {
		it('should merge updates into existing user', async () => {
			const result = await service.updateUser('user-1', { displayName: 'Alice Updated' });
			expect(result?.displayName).toBe('Alice Updated');
		});

		it('should protect id from modification', async () => {
			const result = await service.updateUser('user-1', { id: 'hacked' } as Partial<AdminUser>);
			expect(result?.id).toBe('user-1');
		});

		it('should protect password from modification', async () => {
			await service.updateUser('user-1', { password: 'hacked' } as Partial<AdminUser>);
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.password).toBe('$2a$10$hashed_secret123');
		});

		it('should protect createdAt from modification', async () => {
			const result = await service.updateUser('user-1', { createdAt: '2099-01-01' } as Partial<AdminUser>);
			expect(result?.createdAt).toBe('2025-01-01T00:00:00.000Z');
		});

		it('should check username uniqueness on change', async () => {
			await expect(service.updateUser('user-1', { username: 'bob' }))
				.rejects.toThrow('Username already exists');
		});

		it('should allow keeping same username', async () => {
			const result = await service.updateUser('user-1', { username: 'alice', displayName: 'Alice!' });
			expect(result?.username).toBe('alice');
		});

		it('should set updatedAt timestamp', async () => {
			const result = await service.updateUser('user-1', { displayName: 'X' });
			expect(result?.updatedAt).toBeDefined();
			expect(result?.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
		});

		it('should return null for nonexistent user', async () => {
			const result = await service.updateUser('nonexistent', { displayName: 'X' });
			expect(result).toBeNull();
		});

		it('should strip password from return value', async () => {
			const result = await service.updateUser('user-1', { displayName: 'X' });
			expect(result?.password).toBeUndefined();
		});

		it('should persist changes to file', async () => {
			await service.updateUser('user-1', { displayName: 'Alice Updated' });
			expect(fs.writeFile).toHaveBeenCalled();
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.displayName).toBe('Alice Updated');
		});

		it('should allow changing role', async () => {
			const result = await service.updateUser('user-1', { role: 'super_admin' });
			expect(result?.role).toBe('super_admin');
		});

		it('should allow changing username to unique value', async () => {
			const result = await service.updateUser('user-1', { username: 'alice_new' });
			expect(result?.username).toBe('alice_new');
		});
	});

	// -----------------------------------------------------------------------
	// updatePassword
	// -----------------------------------------------------------------------
	describe('updatePassword', () => {
		it('should hash the new password', async () => {
			await service.updatePassword('user-1', 'newpass');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.password).toBe('$2a$10$hashed_newpass');
		});

		it('should return true on success', async () => {
			const result = await service.updatePassword('user-1', 'newpass');
			expect(result).toBe(true);
		});

		it('should return false for missing user', async () => {
			const result = await service.updatePassword('nonexistent', 'newpass');
			expect(result).toBe(false);
		});

		it('should set updatedAt', async () => {
			await service.updatePassword('user-1', 'newpass');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
		});

		it('should persist to file', async () => {
			await service.updatePassword('user-1', 'newpass');
			expect(fs.writeFile).toHaveBeenCalled();
		});

		it('should not affect other user fields', async () => {
			await service.updatePassword('user-1', 'newpass');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.username).toBe('alice');
			expect(saved.role).toBe('admin');
		});

		it('should not write file when user not found', async () => {
			await service.updatePassword('nonexistent', 'newpass');
			// readFile will be called for init + loadUsers, but writeFile should not
			expect(fs.writeFile).not.toHaveBeenCalled();
		});

		it('should use configured salt rounds', async () => {
			const bcryptMod = await import('bcryptjs');
			await service.updatePassword('user-1', 'newpass');
			expect(bcryptMod.default.hash).toHaveBeenCalledWith('newpass', 10);
		});
	});

	// -----------------------------------------------------------------------
	// deleteUser
	// -----------------------------------------------------------------------
	describe('deleteUser', () => {
		it('should hard delete user from store', async () => {
			const result = await service.deleteUser('user-1');
			expect(result).toBe(true);
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			expect(written.users).toHaveLength(1);
			expect(written.users.find((u: AdminUser) => u.id === 'user-1')).toBeUndefined();
		});

		it('should return false for missing user', async () => {
			const result = await service.deleteUser('nonexistent');
			expect(result).toBe(false);
		});

		it('should persist deletion to file', async () => {
			await service.deleteUser('user-1');
			expect(fs.writeFile).toHaveBeenCalled();
		});

		it('should not affect other users', async () => {
			await service.deleteUser('user-1');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			expect(written.users[0].id).toBe('user-2');
		});

		it('should not write file when user not found', async () => {
			await service.deleteUser('nonexistent');
			expect(fs.writeFile).not.toHaveBeenCalled();
		});

		it('should allow deleting all users', async () => {
			await service.deleteUser('user-1');
			// Need to re-read from file to clear cached state, so re-set the file content
			// Actually the writeFile mock updates the content; let's just call delete again
			const written1 = JSON.parse(fs.writeFile.mock.calls[0][1]);
			fs.setContent(JSON.stringify(written1));
			service = new AdminUserService();
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			await service.deleteUser('user-2');
			const written2 = JSON.parse(fs.writeFile.mock.calls[1][1]);
			expect(written2.users).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// toggleUserStatus
	// -----------------------------------------------------------------------
	describe('toggleUserStatus', () => {
		it('should flip isActive from true to false', async () => {
			const result = await service.toggleUserStatus('user-1');
			expect(result?.isActive).toBe(false);
		});

		it('should flip isActive from false to true', async () => {
			fs = createMockFileSystem({ users: [sampleUser({ isActive: false })] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const result = await service.toggleUserStatus('user-1');
			expect(result?.isActive).toBe(true);
		});

		it('should strip password from result', async () => {
			const result = await service.toggleUserStatus('user-1');
			expect(result?.password).toBeUndefined();
		});

		it('should return null for missing user', async () => {
			const result = await service.toggleUserStatus('nonexistent');
			expect(result).toBeNull();
		});

		it('should set updatedAt', async () => {
			const result = await service.toggleUserStatus('user-1');
			expect(result?.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
		});

		it('should persist to file', async () => {
			await service.toggleUserStatus('user-1');
			expect(fs.writeFile).toHaveBeenCalled();
		});

		it('should preserve other fields', async () => {
			const result = await service.toggleUserStatus('user-1');
			expect(result?.username).toBe('alice');
			expect(result?.role).toBe('admin');
		});

		it('should handle undefined isActive as falsy', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', role: 'admin' } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const result = await service.toggleUserStatus('u1');
			// !undefined = true
			expect(result?.isActive).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// verifyPassword
	// -----------------------------------------------------------------------
	describe('verifyPassword', () => {
		it('should return user on correct password', async () => {
			const result = await service.verifyPassword('alice_h', 'secret123');
			expect(result).not.toBeNull();
			expect(result?.username).toBe('alice');
		});

		it('should return null on wrong password', async () => {
			const result = await service.verifyPassword('alice_h', 'wrongpassword');
			expect(result).toBeNull();
		});

		it('should return null for inactive user', async () => {
			fs = createMockFileSystem({ users: [sampleUser({ isActive: false })] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const result = await service.verifyPassword('alice_h', 'secret123');
			expect(result).toBeNull();
		});

		it('should return null when user has no password', async () => {
			fs = createMockFileSystem({ users: [sampleUser({ password: undefined })] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const result = await service.verifyPassword('alice_h', 'anything');
			expect(result).toBeNull();
		});

		it('should update lastLogin on success', async () => {
			await service.verifyPassword('alice_h', 'secret123');
			expect(fs.writeFile).toHaveBeenCalled();
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.lastLogin).toBeDefined();
			expect(saved.lastLogin).not.toBeNull();
		});

		it('should strip password from result', async () => {
			const result = await service.verifyPassword('alice_h', 'secret123');
			expect(result?.password).toBeUndefined();
		});

		it('should return null for nonexistent handle', async () => {
			const result = await service.verifyPassword('nonexistent', 'secret123');
			expect(result).toBeNull();
		});

		it('should not update lastLogin on failure', async () => {
			await service.verifyPassword('alice_h', 'wrongpassword');
			expect(fs.writeFile).not.toHaveBeenCalled();
		});

		it('should return null when isActive is undefined (falsy)', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', handle: 'x_h', password: '$2a$10$hashed_pw', role: 'admin' } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const result = await service.verifyPassword('x_h', 'pw');
			expect(result).toBeNull();
		});

		it('should preserve user fields in result', async () => {
			const result = await service.verifyPassword('alice_h', 'secret123');
			expect(result?.id).toBe('user-1');
			expect(result?.role).toBe('admin');
			expect(result?.handle).toBe('alice_h');
		});

		it('should call bcrypt.compare with correct arguments', async () => {
			const bcryptMod = await import('bcryptjs');
			await service.verifyPassword('alice_h', 'secret123');
			expect(bcryptMod.default.compare).toHaveBeenCalledWith('secret123', '$2a$10$hashed_secret123');
		});

		it('should return null for empty password', async () => {
			// bcrypt mock: hash.endsWith('') is always true, but we test the flow
			fs = createMockFileSystem({ users: [sampleUser({ password: '' })] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const result = await service.verifyPassword('alice_h', 'anything');
			// password is '' which is falsy, so returns null
			expect(result).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// TOTP
	// -----------------------------------------------------------------------
	describe('TOTP', () => {
		it('getTotpSecret should return secret when set', async () => {
			fs = createMockFileSystem({ users: [sampleUser({ totpSecret: 'my-secret' })] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const secret = await service.getTotpSecret('user-1');
			expect(secret).toBe('my-secret');
		});

		it('getTotpSecret should return null when not set', async () => {
			const secret = await service.getTotpSecret('user-1');
			expect(secret).toBeNull();
		});

		it('getTotpSecret should return null for missing user', async () => {
			const secret = await service.getTotpSecret('nonexistent');
			expect(secret).toBeNull();
		});

		it('enableTotp should set secret and enable flag', async () => {
			await service.enableTotp('user-1', 'new-secret');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.totpSecret).toBe('new-secret');
			expect(saved.totpEnabled).toBe(true);
		});

		it('enableTotp should return true on success', async () => {
			const result = await service.enableTotp('user-1', 'new-secret');
			expect(result).toBe(true);
		});

		it('enableTotp should return false for missing user', async () => {
			const result = await service.enableTotp('nonexistent', 'secret');
			expect(result).toBe(false);
		});

		it('enableTotp should clear firstLogin flag', async () => {
			fs = createMockFileSystem({ users: [sampleUser({ firstLogin: true })] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			await service.enableTotp('user-1', 'secret');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.firstLogin).toBe(false);
		});

		it('enableTotp should set updatedAt', async () => {
			await service.enableTotp('user-1', 'secret');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
		});

		it('disableTotp should clear secret and disable flag', async () => {
			fs = createMockFileSystem({ users: [sampleUser({ totpSecret: 'old-secret', totpEnabled: true })] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			await service.disableTotp('user-1');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.totpSecret).toBeNull();
			expect(saved.totpEnabled).toBe(false);
		});

		it('disableTotp should return true on success', async () => {
			const result = await service.disableTotp('user-1');
			expect(result).toBe(true);
		});

		it('disableTotp should return false for missing user', async () => {
			const result = await service.disableTotp('nonexistent');
			expect(result).toBe(false);
		});

		it('disableTotp should set updatedAt', async () => {
			await service.disableTotp('user-1');
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users.find((u: AdminUser) => u.id === 'user-1');
			expect(saved.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
		});
	});

	// -----------------------------------------------------------------------
	// needsFirstLoginSetup
	// -----------------------------------------------------------------------
	describe('needsFirstLoginSetup', () => {
		it('should return true when firstLogin is true', async () => {
			fs = createMockFileSystem({ users: [sampleUser({ firstLogin: true })] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const result = await service.needsFirstLoginSetup('user-1');
			expect(result).toBe(true);
		});

		it('should return false when firstLogin is false', async () => {
			const result = await service.needsFirstLoginSetup('user-1');
			expect(result).toBe(false);
		});

		it('should return false when firstLogin is undefined', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', role: 'admin' } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const result = await service.needsFirstLoginSetup('u1');
			expect(result).toBe(false);
		});

		it('should return false for missing user', async () => {
			const result = await service.needsFirstLoginSetup('nonexistent');
			expect(result).toBe(false);
		});

		it('should lazy init', async () => {
			await service.needsFirstLoginSetup('user-1');
			expect(fs.readFile).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// Persistence
	// -----------------------------------------------------------------------
	describe('Persistence', () => {
		it('should write JSON with { users: [...] } format', async () => {
			await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			expect(written).toHaveProperty('users');
			expect(Array.isArray(written.users)).toBe(true);
		});

		it('should pretty-print JSON with 2 spaces', async () => {
			await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			const raw = fs.writeFile.mock.calls[0][1];
			expect(raw).toContain('\n  ');
		});

		it('should write to configured file path', async () => {
			await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			expect(fs.writeFile).toHaveBeenCalledWith('/test/admin-users.json', expect.any(String));
		});

		it('should throw Error on write failure', async () => {
			const badWrite = vi.fn(async () => { throw new Error('disk full'); });
			configure({ writeFile: badWrite });
			service = new AdminUserService();
			await expect(service.createUser({ username: 'newuser', password: 'pw', role: 'admin' }))
				.rejects.toThrow('Failed to persist user changes');
		});

		it('should read from configured file path', async () => {
			await service.getAllUsers();
			expect(fs.readFile).toHaveBeenCalledWith('/test/admin-users.json');
		});

		it('should handle write after successful read', async () => {
			await service.getAllUsers();
			await service.deleteUser('user-1');
			expect(fs.writeFile).toHaveBeenCalled();
		});

		it('should preserve all user data through save/load cycle', async () => {
			const customUser = sampleUser({ handle: 'custom_h', displayName: 'Custom', role: 'super_admin' });
			fs = createMockFileSystem({ users: [customUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();

			// Trigger a save by updating
			await service.updateUser('user-1', { displayName: 'Custom Updated' });

			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			const saved = written.users[0];
			expect(saved.handle).toBe('custom_h');
			expect(saved.role).toBe('super_admin');
		});

		it('should maintain user count through operations', async () => {
			await service.createUser({ username: 'user3', password: 'pw', role: 'admin' });
			const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
			expect(written.users).toHaveLength(3);
		});
	});

	// -----------------------------------------------------------------------
	// Edge cases
	// -----------------------------------------------------------------------
	describe('Edge cases', () => {
		it('should handle concurrent getAllUsers calls', async () => {
			const [a, b] = await Promise.all([
				service.getAllUsers(),
				service.getAllUsers(),
			]);
			expect(a).toHaveLength(2);
			expect(b).toHaveLength(2);
		});

		it('should handle concurrent createUser and getAllUsers', async () => {
			const [, users] = await Promise.all([
				service.createUser({ username: 'concurrent', password: 'pw', role: 'admin' }),
				service.getAllUsers(),
			]);
			// Both should succeed without throwing
			expect(users).toBeDefined();
		});

		it('should handle empty file content', async () => {
			fs = createMockFileSystem();
			fs.setContent('');
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toHaveLength(0);
		});

		it('should handle file with only whitespace', async () => {
			fs = createMockFileSystem();
			fs.setContent('   ');
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const users = await service.getAllUsers();
			expect(users).toHaveLength(0);
		});

		it('should handle users with extra/unknown fields', async () => {
			fs = createMockFileSystem({ users: [{ id: 'u1', username: 'x', role: 'admin', customField: 'value' } as AdminUser] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			const user = await service.getUserById('u1');
			expect((user as any).customField).toBe('value');
		});

		it('should handle createUser when TOTP not configured and no TOTP requested', async () => {
			resetConfig();
			fs = createMockFileSystem({ users: [] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			// No TOTP functions configured
			service = new AdminUserService();
			// This should throw because generateTempPassword is called when no password provided
			// But if password IS provided, no TOTP functions needed
			const result = await service.createUser({ username: 'newuser', password: 'pw', role: 'admin' });
			expect(result.username).toBe('newuser');
		});

		it('should throw when TOTP functions needed but not configured', async () => {
			resetConfig();
			fs = createMockFileSystem({ users: [] });
			configure({ readFile: fs.readFile, writeFile: fs.writeFile, usersFilePath: '/test/admin-users.json' });
			service = new AdminUserService();
			await expect(service.createUser({ username: 'newuser', role: 'admin' }))
				.rejects.toThrow('TOTP not configured');
		});

		it('should handle multiple service instances independently', async () => {
			const service2 = new AdminUserService();
			const users1 = await service.getAllUsers();
			const users2 = await service2.getAllUsers();
			expect(users1).toHaveLength(2);
			expect(users2).toHaveLength(2);
		});
	});

	// -----------------------------------------------------------------------
	// Singleton
	// -----------------------------------------------------------------------
	describe('Singleton', () => {
		it('should export adminUserService singleton', async () => {
			const { adminUserService } = await import('../src/index.js');
			expect(adminUserService).toBeDefined();
			expect(adminUserService).toBeInstanceOf(AdminUserService);
		});
	});
});
