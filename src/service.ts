









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








export class AdminUserService {
	private users: Map<string, AdminUser> = new Map();
	private initialized: boolean = false;

	constructor() {
		
	}

	


	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.loadUsers();
			this.initialized = true;
		}
	}

	




	private async loadUsers(): Promise<void> {
		try {
			const readFile = await getReadFile();
			const data = await readFile(getUsersFilePath());
			const parsed = JSON.parse(data);
			const usersArray = Array.isArray(parsed) ? parsed : parsed.users || [];

			this.users.clear();
			for (const user of usersArray) {
				
				if (user.passwordHash && !user.password) {
					user.password = user.passwordHash;
				}
				
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

	



	async getAllUsers(): Promise<AdminUser[]> {
		await this.ensureInitialized();
		await this.loadUsers();
		return Array.from(this.users.values()).map(user => ({
			...user,
			password: undefined,
		}));
	}

	





	async getUserById(id: string): Promise<AdminUser | null> {
		await this.ensureInitialized();
		await this.loadUsers();
		const user = this.users.get(id);
		if (!user) return null;

		return user;
	}

	





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

	











	async createUser(data: CreateUserData, _createdBy?: string): Promise<CreateUserResult> {
		await this.ensureInitialized();
		await this.loadUsers();

		
		const existing = Array.from(this.users.values()).find(u => u.username === data.username);
		if (existing) {
			throw new Error('Username already exists');
		}

		
		let tempPassword: string | undefined;
		if (data.generateCredentials || !data.password) {
			const generateTempPassword = getGenerateTempPassword();
			tempPassword = generateTempPassword(12);
		}
		const passwordToHash = data.password || tempPassword!;
		const hashedPassword = await bcrypt.hash(passwordToHash, getSaltRounds());

		
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

	







	async updateUser(id: string, data: Partial<AdminUser>): Promise<AdminUser | null> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return null;

		
		delete data.id;
		delete data.password;
		delete data.createdAt;

		
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

	





	async deleteUser(id: string): Promise<boolean> {
		await this.ensureInitialized();
		await this.loadUsers();

		if (!this.users.has(id)) return false;

		this.users.delete(id);
		await this.saveUsers();

		return true;
	}

	





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

	







	async verifyPassword(handle: string, password: string): Promise<AdminUser | null> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = Array.from(this.users.values()).find(u => u.handle === handle);
		if (!user || !user.isActive) return null;

		if (!user.password) return null;

		const isValid = await bcrypt.compare(password, user.password);
		if (!isValid) return null;

		
		user.lastLogin = new Date().toISOString();
		this.users.set(user.id, user);
		await this.saveUsers();

		return {
			...user,
			password: undefined,
		};
	}

	





	async getTotpSecret(id: string): Promise<string | null> {
		await this.ensureInitialized();
		await this.loadUsers();
		const user = this.users.get(id);
		return user?.totpSecret || null;
	}

	






	async enableTotp(id: string, secret: string): Promise<boolean> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return false;

		user.totpSecret = secret;
		user.totpEnabled = true;
		user.updatedAt = new Date().toISOString();

		
		if (user.firstLogin) {
			user.firstLogin = false;
		}

		this.users.set(id, user);
		await this.saveUsers();

		return true;
	}

	





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

	





	async needsFirstLoginSetup(id: string): Promise<boolean> {
		await this.ensureInitialized();
		await this.loadUsers();

		const user = this.users.get(id);
		if (!user) return false;

		return user.firstLogin === true;
	}
}


export const adminUserService = new AdminUserService();
