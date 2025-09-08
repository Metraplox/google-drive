import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { EmailService } from 'src/email/email.service';

@Module({
  imports: [EmailService],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
