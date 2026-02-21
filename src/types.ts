/**
 * Types for tinyland-admin-user-service
 *
 * Minimal AdminUser interface containing only the fields the service
 * actually reads and writes. The index signature allows pass-through of
 * additional application-specific fields.
 *
 * @module types
 */

/**
 * Admin user record stored in the flat-file JSON database.
 */
export interface AdminUser {
	id: string;
	username: string;
	handle?: string;
	displayName?: string;
	password?: string;
	passwordHash?: string;
	role: string;
	isActive?: boolean;
	active?: boolean;
	createdAt?: string;
	updatedAt?: string;
	lastLogin?: string | null;
	totpSecret?: string | null;
	totpEnabled?: boolean;
	firstLogin?: boolean;
	/** Allow additional application-specific fields */
	[key: string]: unknown;
}

/**
 * Data required to create a new admin user via the service.
 */
export interface CreateUserData {
	username: string;
	password?: string;
	role: string;
	displayName?: string;
	generateCredentials?: boolean;
	totpSecret?: string;
	firstLogin?: boolean;
}

/**
 * Result returned from createUser, extending AdminUser with optional
 * credential fields generated during creation.
 */
export interface CreateUserResult extends AdminUser {
	tempPassword?: string;
	qrCode?: string;
	totpUri?: string;
}

/**
 * Configuration options for AdminUserService.
 *
 * All fields are optional. Sensible defaults are used when
 * no configuration is provided.
 */
export interface AdminUserServiceConfig {
	/** Path to admin users JSON file */
	usersFilePath?: string;
	/** bcrypt salt rounds (default: 10) */
	saltRounds?: number;
	/** File read function (default: fs.readFile) */
	readFile?: (path: string) => Promise<string>;
	/** File write function (default: fs.writeFile) */
	writeFile?: (path: string, data: string) => Promise<void>;
	/** Generate TOTP secret */
	generateTOTPSecret?: () => string;
	/** Generate TOTP URI */
	generateTOTPUri?: (secret: string, issuer: string, account: string) => string;
	/** Generate TOTP QR code */
	generateTOTPQRCode?: (uri: string) => Promise<string>;
	/** Generate temporary password */
	generateTempPassword?: (length: number) => string;
}
