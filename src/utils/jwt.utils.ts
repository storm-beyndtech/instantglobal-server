import jwt from 'jsonwebtoken';
import { IJWTPayload, IUser } from '../types/auth.types';

export class JWTUtils {
  private static readonly ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
  private static readonly REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key';
  private static readonly ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
  private static readonly REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  /**
   * Generate access token
   */
  static generateAccessToken(user: IUser): string {
    const payload: IJWTPayload = {
      userId: user._id,
      email: user.personalInfo.email,
      role: user.role,
      kycStatus: user.kycStatus,
      accountStatus: user.accountStatus
    };

    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET);
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(user: IUser): string {
    const payload = {
      userId: user._id,
      email: user.personalInfo.email,
      tokenVersion: Date.now() // Add token version for invalidation
    };

    return jwt.sign(payload, this.REFRESH_TOKEN_SECRET);
  }

  /**
   * Generate both access and refresh tokens
   */
  static generateTokenPair(user: IUser): { accessToken: string; refreshToken: string } {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user)
    };
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token: string): IJWTPayload {
    try {
      return jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: '99infinite',
        audience: 'client'
      }) as IJWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token: string): any {
    try {
      return jwt.verify(token, this.REFRESH_TOKEN_SECRET, {
        issuer: '99infinite',
        audience: 'client'
      });
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  static decodeToken(token: string): any {
    return jwt.decode(token);
  }

  /**
   * Get token expiration time
   */
  static getTokenExpirationTime(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token: string): boolean {
    const expirationTime = this.getTokenExpirationTime(token);
    if (!expirationTime) return true;
    return expirationTime < new Date();
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }

  /**
   * Generate email verification token
   */
  static generateEmailVerificationToken(userId: string, email: string): string {
    const payload = {
      userId,
      email,
      type: 'email_verification'
    };

    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, {
      expiresIn: '24h',
      issuer: '99infinite',
      audience: 'email_verification'
    });
  }

  /**
   * Generate password reset token
   */
  static generatePasswordResetToken(userId: string, email: string): string {
    const payload = {
      userId,
      email,
      type: 'password_reset',
      timestamp: Date.now()
    };

    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, {
      expiresIn: '1h',
      issuer: '99infinite',
      audience: 'password_reset'
    });
  }

  /**
   * Verify email verification token
   */
  static verifyEmailVerificationToken(token: string): any {
    try {
      return jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: '99infinite',
        audience: 'email_verification'
      });
    } catch (error) {
      throw new Error('Invalid or expired email verification token');
    }
  }

  /**
   * Verify password reset token
   */
  static verifyPasswordResetToken(token: string): any {
    try {
      return jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: '99infinite',
        audience: 'password_reset'
      });
    } catch (error) {
      throw new Error('Invalid or expired password reset token');
    }
  }
}

export default JWTUtils;