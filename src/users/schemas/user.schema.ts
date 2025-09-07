import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongoose';
import { UserRole } from '../entities/user.entity';

export type UserDocument = User;

@Schema({ timestamps: true })
export class User {
  _id!: ObjectId;

  @Prop({ required: true })
  username!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ default: false })
  email_verified!: boolean;

  @Prop()
  verification_token?: string;

  @Prop()
  verification_token_expires?: Date;

  @Prop()
  reset_password_token?: string;

  @Prop()
  reset_password_expires?: Date;

  @Prop({ default: 'user' })
  role!: UserRole;

  @Prop({ default: true })
  is_active!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);