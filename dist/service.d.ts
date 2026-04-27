import type { AdminUser, CreateUserData, CreateUserResult } from './types.js';
export declare class AdminUserService {
    private users;
    private initialized;
    constructor();
    private ensureInitialized;
    private loadUsers;
    private saveUsers;
    private sanitizeUser;
    getAllUsers(): Promise<AdminUser[]>;
    getUserById(id: string): Promise<AdminUser | null>;
    getUserByHandle(handle: string): Promise<AdminUser | null>;
    createUser(data: CreateUserData, _createdBy?: string): Promise<CreateUserResult>;
    updateUser(id: string, data: Partial<AdminUser>): Promise<AdminUser | null>;
    updatePassword(id: string, newPassword: string): Promise<boolean>;
    deleteUser(id: string): Promise<boolean>;
    toggleUserStatus(id: string): Promise<AdminUser | null>;
    verifyPassword(handle: string, password: string): Promise<AdminUser | null>;
    getTotpSecret(id: string): Promise<string | null>;
    enableTotp(id: string, secret: string): Promise<boolean>;
    disableTotp(id: string): Promise<boolean>;
    needsFirstLoginSetup(id: string): Promise<boolean>;
}
export declare const adminUserService: AdminUserService;
//# sourceMappingURL=service.d.ts.map