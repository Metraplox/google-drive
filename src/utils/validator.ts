import { ApiError } from "../utils/errors"

// List of disposable email domains (partial example)
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  'disposable.com',
  'throwaway.com',
  'mailinator.com',
  'guerrillamail.com',
];

export class Validator {
  validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw ApiError.invalidData("Password must be at least 8 characters long");
    }

    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    const errorMessages: string[] = [];

    if (!hasUppercase) {
      errorMessages.push("at least one uppercase letter");
    }
    if (!hasLowercase) {
      errorMessages.push("at least one lowercase letter");
    }
    if (!hasDigit) {
      errorMessages.push("at least one digit");
    }
    if (!hasSpecial) {
      errorMessages.push("at least one special character");
    }

    if (errorMessages.length > 0) {
      const errorMsg = `Password must contain: ${errorMessages.join(", ")}`;
      throw ApiError.invalidData(errorMsg);
    }
  }

  validateEmail(email: string): void {
    if (email.length === 0) {
      throw ApiError.invalidData("Email cannot be empty");
    }

    if (email.length > 254) {
      throw ApiError.invalidData("Email is too long");
    }

    // More comprehensive email regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!emailRegex.test(email)) {
      throw ApiError.invalidData("Invalid email format");
    }

    const domain = email.split('@')[1];
    if (domain && DISPOSABLE_EMAIL_DOMAINS.some(d => domain.toLowerCase() === d.toLowerCase())) {
      throw ApiError.invalidData("Disposable email addresses are not allowed");
    }
  }
}