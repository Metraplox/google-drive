import { Injectable } from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

import { Validator } from "../utils/validator";
import { ApiError } from "../utils/errors";
import {
  User,
  UserLoginReceive,
  UserRole,
  UserSend,
} from "./entities/user.entity";
import { Model, ObjectId, Types } from "mongoose";
import { UserDocument } from "./schemas/user.schema";
import { InjectModel } from "@nestjs/mongoose";
import { AuthUtils } from "../utils/auth";
import { EmailService } from "../email/email.service";
import { randomBytes } from "crypto";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
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

      const code = await this.emailService.sendVerificationEmail(
        createUserDto.email
      );

      let userData = new User(createUserDto, hashedPassword, code);

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

  async login(credentials: UserLoginReceive): Promise<UserSend> {
    try {
      let user = await this.findOneByEmail(credentials.email);

      const isPasswordValid = await this.authUtils.verifyPassword(
        credentials.password,
        user.password
      );

      if (!isPasswordValid) {
        throw ApiError.unauthorized("Invalid email or password");
      }

      if (!user.email_verified) {
        throw ApiError.unauthorized(
          "Email not verified. Please check your email for verification instructions."
        );
      }

      if (user.is_active === false) {
        throw ApiError.unauthorized(
          "Account is deactivated. Please contact support."
        );
      }

      const accessToken = this.authUtils.generateToken(user.email, 60 * 24); // 24 hours
      const refreshToken = this.authUtils.generateToken(
        user.email,
        60 * 24 * 30
      ); // 30 days

      user.access_token = accessToken;
      user.refresh_token = refreshToken;

      await this.updateTokens(user._id, accessToken, refreshToken);

      const userSend: UserSend = {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || UserRole.USER,
        access_token: accessToken,
      };

      return userSend;
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        throw e;
      }

      if (e instanceof ApiError && e.getStatus() === 404) {
        throw ApiError.unauthorized("Invalid email or password");
      }

      throw ApiError.internalServerError("Login failed");
    }
  }

  async verifyEmail(verificationToken: string): Promise<void> {
    const user = await this.userModel
      .findOne({
        verification_token: verificationToken,
        verification_token_expires: { $gt: new Date() },
      })
      .exec();

    if (!user) {
      throw ApiError.badRequest("Invalid or expired verification token");
    }

    const result = await this.userModel
      .updateOne(
        { _id: user._id },
        {
          $set: {
            email_verified: true,
            verification_token: null,
            verification_token_expires: null,
            updated_at: new Date(),
          },
        }
      )
      .exec();

    if (result.matchedCount === 0) {
      throw ApiError.notFound("User not found during verification");
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

  async update(id: ObjectId, updateUserDto: UpdateUserDto): Promise<void> {
    try {
      const updateData: UpdateUserDto = { updatedAt: new Date() };

      if (updateUserDto.is_active !== undefined) {
        updateData.is_active = updateUserDto.is_active;
      }

      if (updateUserDto.role !== undefined) {
        updateData.role = updateUserDto.role;
      }

      this.userModel.updateOne({ _id: id }, updateData);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        throw e;
      }

      if (e instanceof Error) {
        // Handle MongoDB errors
        if (e.name === "CastError") {
          throw ApiError.badRequest("Invalid user ID format");
        }

        throw ApiError.internalServerError("Failed to update user");
      }

      throw ApiError.internalServerError(
        "Failed to update user due to unknown error"
      );
    }
  }

  async initiatePasswordChange(
    email: string
  ): Promise<{ resetToken: string; expiresAt: Date }> {
    try {
      const user = await this.userModel.findOne({ email }).exec();
      if (!user) {
        // Don't reveal if email exists for security
        throw ApiError.notFound(
          "If the email exists, a password reset code has been sent"
        );
      }

      // Generate 6-digit verification code
      const verificationCode =
        await this.emailService.sendPasswordResetEmail(email);

      // Generate secure reset token
      const resetToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store both code and token
      await this.userModel
        .updateOne(
          { _id: user._id },
          {
            $set: {
              password_reset_code: verificationCode,
              password_reset_code_expires: expiresAt,
              reset_password_token: resetToken,
              reset_password_expires: expiresAt,
              updated_at: new Date(),
            },
          }
        )
        .exec();

      return { resetToken, expiresAt };
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        throw e;
      }
      throw ApiError.internalServerError("Failed to initiate password change");
    }
  }

  async verifyPasswordChangeCode(
    resetToken: string,
    verificationCode: string
  ): Promise<{ isValid: boolean; message: string }> {
    try {
      const user = await this.userModel
        .findOne({
          reset_password_token: resetToken,
          reset_password_expires: { $gt: new Date() },
          password_reset_code: verificationCode,
          password_reset_code_expires: { $gt: new Date() },
        })
        .exec();

      if (!user) {
        return {
          isValid: false,
          message: "Invalid or expired verification code",
        };
      }

      // Code is valid - you might want to mark it as used or extend the token
      await this.userModel
        .updateOne(
          { _id: user._id },
          {
            $set: {
              reset_password_expires: new Date(Date.now() + 5 * 60 * 1000), // Extend 5 more minutes
              updated_at: new Date(),
            },
            $unset: { password_reset_code: 1 }, // Remove code after successful verification
          }
        )
        .exec();

      return { isValid: true, message: "Verification code accepted" };
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        throw e;
      }
      throw ApiError.internalServerError(
        "Failed to verify password change code"
      );
    }
  }

  async completePasswordChange(
    resetToken: string,
    newPassword: string
  ): Promise<void> {
    try {
      const user = await this.userModel
        .findOne({
          reset_password_token: resetToken,
          reset_password_expires: { $gt: new Date() },
        })
        .exec();

      if (!user) {
        throw ApiError.badRequest("Invalid or expired reset token");
      }

      // Validate new password strength
      this.validator.validatePasswordStrength(newPassword);

      // Hash new password
      const hashedPassword = await this.authUtils.hashPassword(newPassword);

      // Update password and clear all reset data
      const result = await this.userModel
        .updateOne(
          { _id: user._id },
          {
            $set: {
              password: hashedPassword,
              updated_at: new Date(),
            },
            $unset: {
              reset_password_token: 1,
              reset_password_expires: 1,
              password_reset_code: 1,
              password_reset_code_expires: 1,
              access_token: 1, // Invalidate existing sessions
              refresh_token: 1,
            },
          }
        )
        .exec();

      if (result.matchedCount === 0) {
        throw ApiError.notFound("User not found during password update");
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        throw e;
      }
      throw ApiError.internalServerError("Failed to complete password change");
    }
  }

  async resendPasswordChangeCode(
    resetToken: string
  ): Promise<{ newCode: string; expiresAt: Date }> {
    try {
      const user = await this.userModel
        .findOne({
          reset_password_token: resetToken,
          reset_password_expires: { $gt: new Date() },
        })
        .exec();

      if (!user) {
        throw ApiError.badRequest("Invalid or expired reset token");
      }

      // Generate new 6-digit code
      const newCode = await this.emailService.sendPasswordResetEmail(
        user.email
      );
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Update with new code
      await this.userModel
        .updateOne(
          { _id: user._id },
          {
            $set: {
              password_reset_code: newCode,
              password_reset_code_expires: expiresAt,
              updated_at: new Date(),
            },
          }
        )
        .exec();

      return { newCode, expiresAt };
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internalServerError("Failed to resend verification code");
    }
  }

  async updateTokens(
    userId: Types.ObjectId,
    accessToken: string,
    refreshToken: string
  ): Promise<void> {
    try {
      const result = await this.userModel
        .updateOne(
          { _id: userId },
          {
            $set: {
              access_token: accessToken,
              refresh_token: refreshToken,
              updated_at: new Date(),
            },
          }
        )
        .exec();

      if (result.matchedCount === 0) {
        throw ApiError.notFound("User not found");
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        throw e;
      }

      if (e instanceof Error) {
        if (e.name === "MongoError") {
          throw ApiError.internalServerError(
            "Failed to update user tokens due to database error"
          );
        }

        throw ApiError.internalServerError(
          "Failed to update tokens due to system error"
        );
      }

      throw ApiError.internalServerError("Failed to update tokens");
    }
  }

  async changePassword(
    userId: ObjectId,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw ApiError.notFound("User not found");
    }

    const isCurrentPasswordValid = await this.authUtils.verifyPassword(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      throw ApiError.unauthorized("Current password is incorrect");
    }

    this.validator.validatePasswordStrength(newPassword);

    const hashedPassword = await this.authUtils.hashPassword(newPassword);

    const result = await this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: {
            password: hashedPassword,
            updated_at: new Date(),
            access_token: null,
            refresh_token: null,
          },
        }
      )
      .exec();

    if (result.matchedCount === 0) {
      throw ApiError.notFound("User not found during update");
    }
  }

  async remove(id: ObjectId): Promise<void> {
    try {
      const result = await this.userModel
        .updateOne(
          { _id: id },
          {
            $set: {
              is_active: false,
              access_token: null, // Invalidate active sessions
              refresh_token: null, // Invalidate refresh tokens
              updated_at: new Date(),
            },
          }
        )
        .exec();

      if (result.matchedCount === 0) {
        throw ApiError.notFound(`User not found`);
      }

    } catch (error: unknown) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "CastError") {
          throw ApiError.badRequest("Invalid user ID format");
        }

        throw ApiError.internalServerError("Failed to deactivate user");
      }

      throw ApiError.internalServerError(
        "Failed to deactivate user due to unknown error"
      );
    }
  }
}
