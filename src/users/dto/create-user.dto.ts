import { UserRole } from "../entities/user.entity";
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {

    username!: string;

    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    password!: string;

    is_active!: boolean;
    role!: UserRole;
    access_token!: string;
    refresh_token!: string;
}
