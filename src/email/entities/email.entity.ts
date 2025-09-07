export class Email {
    to!: string;
    subject!: string;
    text_body!: string;
}

export class PasswordResetRequestDto {
  email!: string;
}

export class VerificationRequestDto {
  email!: string;
}
