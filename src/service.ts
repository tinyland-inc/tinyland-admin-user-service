/**
 * AdminUserService - Admin user lifecycle management
 *
 * Provides in-memory caching with file persistence for admin user
 * management. Uses dependency injection for file I/O, TOTP, and
 * password hashing configuration.
 *
 * @module service
 */

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import type { AdminUser, CreateUserData, CreateUserResult } from './types.js';
import {
	getUsersFilePath,
	getSaltRounds,
	getReadFile,
	getWriteFile,
	getGenerateTOTPSecret,
	getGenerateTOTPUri,
	getGenerateTOTPQRCode,
	getGenerateTempPassword,
} from './config.js';

/**
 * Admin user lifecycle management service.
 *
 * Maintains an in-memory Map of users backed by a JSON file on disk.
 * All public methods lazily initialize from disk on first access and
 * refresh from disk on each call for consistency.
 */
export class AdminUserService {
	private users: Map<string, AdminUser> = new Map();
	private initialized: boolean = false;

	constructor() {
		// Load users asynchronously on first use
	}

	/**
	 * Ensure the service has loaded users from disk at least once.
	 */
	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.loadUsers();
			this.initialized = true;
		}
	}

	/**
	 * Load users from the JSON file into the in-memory Map.
	 * Handles both array format and { users: [] } object format.
	 * Maps legacy field names for compatibility.
	 */
	private async loadUsers(): Promise<void> {
		try {
			const readFile = await getReadFile();
			const data = await readFile(getUsersFilePath());
			const parsed = JSON.parse(data);
			const usersArray = Array.isArray(parsed) ? parsed : parsed.users || [];

			this.users.clear();
			for (const user of usersArray) {
				// Map passwordHash to password for compatibility
				if (user.passwordHash && !user.password) {
					user.password = user.passwordHash;
				}
				// Map active to isActive
				if (user.active !== undefined && user.isActive === undefined) {
					user.isActive = user.active;
				}
				this.users.set(user.id, user);
			}
		} catch (error) {
			console.error('Failed to load admin users:', error);
			this.users = new Map();
		}
	}

	/**
	 * Persist the in-memory user Map to disk as JSON.
	 * Wraps in { users: [...] } format.
	 *
	 * @throws Error if write fails
	 */
	private async saveUsers(): Promise<void> {
		try {
			const writeFile = await getWriteFile();
			const usersArray = Array.from(this.users.values());
			await writeFile(getUsersFilePath(), JSON.stringify({ users: usersArray }, null, 2));
		} catch (error) {
			console.error('Failed to save admin users:', error);
			throw new Error('Failed to persist user changes');
		}
	}

	/**
	 * Get all admin users with passwords stripped.
	 * Refreshes from disk before returning.
	 */
	async getAllUsers(): Promise<AdminUser[]> {
		await this.ensureInitialized();
		await this.loadUsers();
		return Array.from(this.users.values()).map(user => ({
			...user,
			password: undefined,
		}));
	}

	/**
	 * Find a user by their ID.
	 *
	 * @param id - User ID to look up
	 * @returns The user or null if not found
	 */
	async getUserById(id: string): Promise<AdminUser | null> {
		await this.ensureInitialized();
		await this.loadUsers();
		const user = this.users.get(id);
		if (!user) return null;

		return user;
	}

	/**
	 * Find a user by their handle. Password is stripped from result.
	 *
	 * @param handle - Handle to look up
	 * @returns The user (without password) or null if not found
	 */
	async getUserByHandle(handle: string): Promise<AdminUser | null> {
		await this.ensureInitialized();
		await this.loadUsers();
		const user = Array.from(this.users.values()).find(u => u.handle === handle);
		if (!user) return null;

		return {
			...user,
			password: undefined,
		};
	}

	/**
	 * Create a new admin user.
	 *
	 * If password is not provided and generateCredentials is true (or password is omitted),
	 * a temporary password is generated. TOTP credentials are generated when
	 * generateCredentials is true or totpSecret is provided.
	 *
	 * @param data - User creation data
	 * @param _createdBy - Optional ID of the creating user (reserved for audit)
	 * @returns Created user with optional credential fields
	 * @throws Error if username already exists
	 */
	async createUser(data: CreateUserData, _createdBy?: string): Promise<CreateUserResult> {
		await this.ensureInitialized();
		await this.loadUsers();

		// Check if username already exists
		const existing = Array.from(this.users.values()).find(u => u.username === data.username);
		if (existing) {
			throw new Error('Username already exists');
		}

		// Generate temporary password if not provided or if generateCredentials is true
		let tempPassword: string | undefined;
		if (data.generateCredentials || !data.password) {
			const generateTempPassword = getGenerateTempPassword();
			tempPassword = generateTempPassword(12);
		}
		const passwordToHash = data.password || tempPassword!;
		const hashedPassword = await bcrypt.hash(passwordToHash, getSaltRounds());

		// Generate TOTP secret if generateCredentials is true or use provided secret
		let totpSecret: string | null = null;
		let qrCode: string | undefined;
		let totpUri: string | undefined;

		if (data.totpSecret || data.generateCredentials) {
			if (data.totpSecret) {
				totpSecret = data.totpSecret;
			} else {
				const generateTOTPSecret = getGenerateTOTPSecret();
				totpSecret = generateTOTPSecret();
			}
			const generateTOTPUri = getGenerateTOTPUri();
			totpUri = generateTOTPUri(totpSecret, 'Tinyland.dev', data.username);
			const generateTOTPQRCode = getGenerateTOTPQRCode();
			qrCode = await generateTOTPQRCode(totpUri);
		}

		const newUser: AdminUser = {
			id: uuidv4(),
			username: data.username,
			password: hashedPassword,
			role: data.role,
			displayName: data.displayName || data.username,
			isActive: true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			lastLogin: null,
			totpSecret: totpSecret,
			totpEnabled: !!totpSecret,
			firstLogin: data.firstLogin !== undefined ? data.firstLogin : !data.password,
		};

		this.users.set(newUser.id, newUser);
		await this.saveUsers();

		return {
			...newUser,
			password: undefined,
			tempPassword,
			qrCode,
			totpUri,
		};
	}

	/**
	 * Update an existing user. Protects id, password, and createdAt from modification.
	 *
	 * @param id - User ID to update
	 * @param data - Partial user data to merge
	 * @returns Updated user (without password) or null if not found
	 * @throws Error if new username already exists
	 */
	async updateUser(id: string, data: Partial<AdminUser>): Promise<AdminUser | null> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return null;

		// Prevent changing certain fields
		delete data.id;
		delete data.password;
		delete data.createdAt;

		// Check if username is being changed and if it's already taken
		if (data.username && data.username !== user.username) {
			const existing = Array.from(this.users.values()).find(u => u.username === data.username);
			if (existing) {
				throw new Error('Username already exists');
			}
		}

		const updatedUser = {
			...user,
			...data,
			updatedAt: new Date().toISOString(),
		};

		this.users.set(id, updatedUser);
		await this.saveUsers();

		return {
			...updatedUser,
			password: undefined,
		};
	}

	/**
	 * Update a user's password (hashes the new password).
	 *
	 * @param id - User ID
	 * @param newPassword - New plaintext password to hash
	 * @returns true if updated, false if user not found
	 */
	async updatePassword(id: string, newPassword: string): Promise<boolean> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return false;

		const hashedPassword = await bcrypt.hash(newPassword, getSaltRounds());

		user.password = hashedPassword;
		user.updatedAt = new Date().toISOString();

		this.users.set(id, user);
		await this.saveUsers();

		return true;
	}

	/**
	 * Hard-delete a user from the store.
	 *
	 * @param id - User ID to delete
	 * @returns true if deleted, false if user not found
	 */
	async deleteUser(id: string): Promise<boolean> {
		await this.ensureInitialized();
		await this.loadUsers();

		if (!this.users.has(id)) return false;

		this.users.delete(id);
		await this.saveUsers();

		return true;
	}

	/**
	 * Toggle a user's active status.
	 *
	 * @param id - User ID
	 * @returns Updated user (without password) or null if not found
	 */
	async toggleUserStatus(id: string): Promise<AdminUser | null> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return null;

		user.isActive = !user.isActive;
		user.updatedAt = new Date().toISOString();

		this.users.set(id, user);
		await this.saveUsers();

		return {
			...user,
			password: undefined,
		};
	}

	/**
	 * Verify a user's password by handle. Updates lastLogin on success.
	 * Returns null for inactive users or invalid credentials.
	 *
	 * @param handle - User handle
	 * @param password - Plaintext password to verify
	 * @returns User (without password) on success, null on failure
	 */
	async verifyPassword(handle: string, password: string): Promise<AdminUser | null> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = Array.from(this.users.values()).find(u => u.handle === handle);
		if (!user || !user.isActive) return null;

		if (!user.password) return null;

		const isValid = await bcrypt.compare(password, user.password);
		if (!isValid) return null;

		// Update last login
		user.lastLogin = new Date().toISOString();
		this.users.set(user.id, user);
		await this.saveUsers();

		return {
			...user,
			password: undefined,
		};
	}

	/**
	 * Get the TOTP secret for a user.
	 *
	 * @param id - User ID
	 * @returns TOTP secret string or null
	 */
	async getTotpSecret(id: string): Promise<string | null> {
		await this.ensureInitialized();
		await this.loadUsers();
		const user = this.users.get(id);
		return user?.totpSecret || null;
	}

	/**
	 * Enable TOTP for a user. Clears firstLogin flag when enabling.
	 *
	 * @param id - User ID
	 * @param secret - TOTP secret to set
	 * @returns true if enabled, false if user not found
	 */
	async enableTotp(id: string, secret: string): Promise<boolean> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return false;

		user.totpSecret = secret;
		user.totpEnabled = true;
		user.updatedAt = new Date().toISOString();

		// Clear firstLogin flag when TOTP is enabled
		if (user.firstLogin) {
			user.firstLogin = false;
		}

		this.users.set(id, user);
		await this.saveUsers();

		return true;
	}

	/**
	 * Disable TOTP for a user.
	 *
	 * @param id - User ID
	 * @returns true if disabled, false if user not found
	 */
	async disableTotp(id: string): Promise<boolean> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return false;

		user.totpSecret = null;
		user.totpEnabled = false;
		user.updatedAt = new Date().toISOString();

		this.users.set(id, user);
		await this.saveUsers();

		return true;
	}

	/**
	 * Check if a user needs first-login setup (password change + TOTP enrollment).
	 *
	 * @param id - User ID
	 * @returns true if firstLogin flag is set, false otherwise or if user not found
	 */
	async needsFirstLoginSetup(id: string): Promise<boolean> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return false;

		return user.firstLogin === true;
	}
}

/** Singleton instance of AdminUserService. */
export const adminUserService = new AdminUserService();
