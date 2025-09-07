import jwt, { SignOptions } from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { ConfigService } from '@nestjs/config';
import { Injectable } from "@nestjs/common";

export interface JwtPayload {
  userId: ObjectId;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class JwtService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiresIn: string | number;
  private readonly refreshTokenExpiresIn: string | number;
  private readonly nodeEnv: string;

  constructor(private readonly configService: ConfigService) {
    this.accessTokenSecret = this.configService.get<string>("JWT_ACCESS_SECRET", "fallback-access-secret");
    this.refreshTokenSecret = this.configService.get<string>("JWT_REFRESH_SECRET", "fallback-refresh-secret");
    this.accessTokenExpiresIn = this.parseExpiresIn(this.configService.get<string>("JWT_ACCESS_EXPIRES_IN", "15m"));
    this.refreshTokenExpiresIn = this.parseExpiresIn(this.configService.get<string>("JWT_REFRESH_EXPIRES_IN", "7d"));
    this.nodeEnv = this.configService.get<string>("NODE_ENV", "development");

    this.validateSecrets();
  }

  private validateSecrets(): void {
    if (this.nodeEnv === "production") {
      const defaultSecrets = [
        "fallback-access-secret",
        "fallback-refresh-secret",
      ];

      if (defaultSecrets.includes(this.accessTokenSecret)) {
        throw new Error(
          "JWT_ACCESS_SECRET must be set to a secure value in production"
        );
      }
      if (defaultSecrets.includes(this.refreshTokenSecret)) {
        throw new Error(
          "JWT_REFRESH_SECRET must be set to a secure value in production"
        );
      }
    }
  }

  private parseExpiresIn(expiresIn: string | number): string | number {
    if (typeof expiresIn === 'number') {
      return expiresIn;
    }

    // If it's already a valid number string, return as number
    if (!isNaN(Number(expiresIn))) {
      return Number(expiresIn);
    }

    // For time strings like "15m", "1h", "7d", let jwt handle them
    return expiresIn;
  }

  generateTokenPair(payload: Omit<JwtPayload, "iat" | "exp">): TokenPair {
    const signOptions: SignOptions = {
      expiresIn: this.accessTokenExpiresIn as number,
    };

    const accessToken = jwt.sign(payload, this.accessTokenSecret, signOptions);

    const refreshToken = jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiresIn,
    } as SignOptions);

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.accessTokenSecret) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      }
      throw new Error('Token verification failed');
    }
  }

  verifyRefreshToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.refreshTokenSecret) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw new Error('Refresh token verification failed');
    }
  }

  refreshAccessToken(refreshToken: string): string {
    const payload = this.verifyRefreshToken(refreshToken);
    
    // Remove iat and exp from the payload before generating new token
    const { iat, exp, ...cleanPayload } = payload;
    
    return jwt.sign(
      cleanPayload,
      this.accessTokenSecret,
      { expiresIn: this.accessTokenExpiresIn } as SignOptions
    );
  }

  decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch {
      return null;
    }
  }

  getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) return null;
    
    return new Date(decoded.exp * 1000); // Convert to milliseconds
  }

  isTokenExpiringSoon(token: string, thresholdMinutes: number = 5): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) return false;

    const now = new Date();
    const thresholdMs = thresholdMinutes * 60 * 1000;
    return expiration.getTime() - now.getTime() <= thresholdMs;
  }
}
