import { Injectable } from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

import { Validator } from "../utils/validator";
import { ApiError } from "../utils/errors";
import { User, UserRole, UserSend } from "./entities/user.entity";
import { Model } from "mongoose";
import { UserDocument } from "./schemas/user.schema";
import { InjectModel } from "@nestjs/mongoose";
import { AuthUtils } from "../utils/auth";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly validator: Validator,
    private readonly authUtils: AuthUtils
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserSend> {
    try {
      this.validator.validateEmail(createUserDto.email);
      this.validator.validatePasswordStrength(createUserDto.password);

      let existingUser = await this.findOneByEmail(createUserDto.email);

      if (existingUser) {
        if (existingUser.email_verified) {
          throw ApiError.unauthorized(
            "An account with this email already exists but is not verified. If you don't remember your password, please use the password recovery option."
          );
        } else {
          throw ApiError.badRequest("User with this email already exists");
        }
      }

      const hashedPassword = await this.authUtils.hashPassword(
        createUserDto.password
      );

      // here the sending email with the verification code

      let userData = new User(createUserDto, hashedPassword, "abc123");

      const createdUser = this.userModel.insertOne(userData);

      const userSend: UserSend = {
        _id: (await createdUser).id,
        username: createUserDto.username,
        email: createUserDto.email,
        role: createUserDto.role || UserRole.USER,
        access_token: undefined,
      };

      return userSend;
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        throw e;
      }

      if (e instanceof Error) {
        throw ApiError.internalServerError("Failed to create user");
      }

      throw ApiError.internalServerError(
        "Failed to create user due to unknown error"
      );
    }
  }

  async findOneByEmail(email: string): Promise<User> {
    try {
      const user = await this.userModel.findOne({ email: email }).exec();

      if (user) {
        return {
          _id: user._id,
          username: user.username,
          email: user.email,
          password: user.password,
          role: user.role,
          email_verified: user.email_verified,
          verification_code: undefined,
          verification_code_expires: undefined,
          password_reset_code: undefined,
          password_reset_expires: undefined,
        } as unknown as User;

      } else {
        throw ApiError.notFound("User not found");
      }

    } catch (e: unknown) {
      
      if (e instanceof ApiError) {
        throw e;
      }

      if (e instanceof Error) {
        throw ApiError.internalServerError("Failed to find user");
      }

      throw ApiError.internalServerError(
        "Failed to create user due to unknown error"
      );
    }
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
