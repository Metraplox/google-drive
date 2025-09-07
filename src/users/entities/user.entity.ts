import { ObjectId } from 'mongodb';
import { CreateUserDto } from '../dto/create-user.dto';

export enum UserRole {
    ADMIN = "Admin",
    USER = "User"
}

export class User {
    static username(username: any): (target: typeof import("../users.service").UsersService, propertyKey: undefined, parameterIndex: 0) => void {
      throw new Error("Method not implemented.");
    }
    _id!: ObjectId;
    username!: string;
    email!: string;
    password!: string;
    role!: UserRole;
    access_token?: string;
    refresh_token?: string;
    email_verified!: boolean;
    verification_code?: string;
    verification_code_expires?: Date;
    password_reset_code?: string;
    password_reset_expires?: Date;
    created_at!: Date;
    updated_at!: Date;

    constructor(createUserDto: CreateUserDto, hashedPassword: string, verificationCode?: string) {
        this._id = new ObjectId();
        this.username = createUserDto.username;
        this.email = createUserDto.email;
        this.password = hashedPassword;
        this.role = createUserDto.role || UserRole.USER;
        this.email_verified = false;
        this.verification_code = verificationCode;
        this.verification_code_expires = verificationCode ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined;
        this.created_at = new Date();
        this.updated_at = new Date();
    }
}

export class UserLoginReceive {
    email!: string;
    password!: string;
}

export class UserSend {
    _id?: ObjectId;
    username!: string;
    email!: string;
    role!: UserRole;
    access_token?: string;
}