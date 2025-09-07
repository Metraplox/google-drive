import { UserRole } from "../entities/user.entity";
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateUserDto {

    username!: string;

    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    password!: string;

    role!: UserRole;
}
