import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getUsersFilePath, getSaltRounds, getReadFile, getWriteFile, getGenerateTOTPSecret, getGenerateTOTPUri, getGenerateTOTPQRCode, getGenerateTempPassword, } from './config.js';
export class AdminUserService {
    users = new Map();
    initialized = false;
    constructor() {
    }
    async ensureInitialized() {
        if (!this.initialized) {
            await this.loadUsers();
            this.initialized = true;
        }
    }
    async loadUsers() {
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
        }
        catch (error) {
            console.error('Failed to load admin users:', error);
            this.users = new Map();
        }
    }
    async saveUsers() {
        try {
            const writeFile = await getWriteFile();
            const usersArray = Array.from(this.users.values());
            await writeFile(getUsersFilePath(), JSON.stringify({ users: usersArray }, null, 2));
        }
        catch (error) {
            console.error('Failed to save admin users:', error);
            throw new Error('Failed to persist user changes');
        }
    }
    sanitizeUser(user) {
        const { password, passwordHash, totpSecret, ...sanitized } = user;
        return sanitized;
    }
    async getAllUsers() {
        await this.ensureInitialized();
        await this.loadUsers();
        return Array.from(this.users.values()).map(user => this.sanitizeUser({ ...user }));
    }
    async getUserById(id) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = this.users.get(id);
        if (!user)
            return null;
        return this.sanitizeUser({ ...user });
    }
    async getUserByHandle(handle) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = Array.from(this.users.values()).find(u => u.handle === handle);
        if (!user)
            return null;
        return this.sanitizeUser({ ...user });
    }
    async createUser(data, _createdBy) {
        await this.ensureInitialized();
        await this.loadUsers();
        const existing = Array.from(this.users.values()).find(u => u.username === data.username);
        if (existing) {
            throw new Error('Username already exists');
        }
        let tempPassword;
        if (data.generateCredentials || !data.password) {
            const generateTempPassword = getGenerateTempPassword();
            tempPassword = generateTempPassword(12);
        }
        const passwordToHash = data.password || tempPassword;
        const hashedPassword = await bcrypt.hash(passwordToHash, getSaltRounds());
        let totpSecret = null;
        let qrCode;
        let totpUri;
        if (data.totpSecret || data.generateCredentials) {
            if (data.totpSecret) {
                totpSecret = data.totpSecret;
            }
            else {
                const generateTOTPSecret = getGenerateTOTPSecret();
                totpSecret = generateTOTPSecret();
            }
            const generateTOTPUri = getGenerateTOTPUri();
            totpUri = generateTOTPUri(totpSecret, 'Tinyland.dev', data.username);
            const generateTOTPQRCode = getGenerateTOTPQRCode();
            qrCode = await generateTOTPQRCode(totpUri);
        }
        const newUser = {
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
        return this.sanitizeUser({
            ...newUser,
            tempPassword,
            qrCode,
            totpUri,
        });
    }
    async updateUser(id, data) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = this.users.get(id);
        if (!user)
            return null;
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
        return this.sanitizeUser({ ...updatedUser });
    }
    async updatePassword(id, newPassword) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = this.users.get(id);
        if (!user)
            return false;
        const hashedPassword = await bcrypt.hash(newPassword, getSaltRounds());
        user.password = hashedPassword;
        user.updatedAt = new Date().toISOString();
        this.users.set(id, user);
        await this.saveUsers();
        return true;
    }
    async deleteUser(id) {
        await this.ensureInitialized();
        await this.loadUsers();
        if (!this.users.has(id))
            return false;
        this.users.delete(id);
        await this.saveUsers();
        return true;
    }
    async toggleUserStatus(id) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = this.users.get(id);
        if (!user)
            return null;
        user.isActive = !user.isActive;
        user.updatedAt = new Date().toISOString();
        this.users.set(id, user);
        await this.saveUsers();
        return this.sanitizeUser({ ...user });
    }
    async verifyPassword(handle, password) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = Array.from(this.users.values()).find(u => u.handle === handle);
        if (!user || !user.isActive)
            return null;
        if (!user.password)
            return null;
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid)
            return null;
        user.lastLogin = new Date().toISOString();
        this.users.set(user.id, user);
        await this.saveUsers();
        return this.sanitizeUser({ ...user });
    }
    async getTotpSecret(id) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = this.users.get(id);
        return user?.totpSecret || null;
    }
    async enableTotp(id, secret) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = this.users.get(id);
        if (!user)
            return false;
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
    async disableTotp(id) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = this.users.get(id);
        if (!user)
            return false;
        user.totpSecret = null;
        user.totpEnabled = false;
        user.updatedAt = new Date().toISOString();
        this.users.set(id, user);
        await this.saveUsers();
        return true;
    }
    async needsFirstLoginSetup(id) {
        await this.ensureInitialized();
        await this.loadUsers();
        const user = this.users.get(id);
        if (!user)
            return false;
        return user.firstLogin === true;
    }
}
export const adminUserService = new AdminUserService();
