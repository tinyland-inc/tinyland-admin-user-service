












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
	
	[key: string]: unknown;
}




export interface CreateUserData {
	username: string;
	password?: string;
	role: string;
	displayName?: string;
	generateCredentials?: boolean;
	totpSecret?: string;
	firstLogin?: boolean;
}





export interface CreateUserResult extends AdminUser {
	tempPassword?: string;
	qrCode?: string;
	totpUri?: string;
}







export interface AdminUserServiceConfig {
	
	usersFilePath?: string;
	
	saltRounds?: number;
	
	readFile?: (path: string) => Promise<string>;
	
	writeFile?: (path: string, data: string) => Promise<void>;
	
	generateTOTPSecret?: () => string;
	
	generateTOTPUri?: (secret: string, issuer: string, account: string) => string;
	
	generateTOTPQRCode?: (uri: string) => Promise<string>;
	
	generateTempPassword?: (length: number) => string;
}
