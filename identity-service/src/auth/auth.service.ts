import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import {
  User,
  RefreshToken,
  Invitation,
  PasswordResetToken,
  UserStatus,
  InvitationStatus,
} from '../entities';
import { EmailService } from '../email/email.service';
import { OrganizationClientService } from '../common/organization-client.service';
import {
  LoginDto,
  RefreshTokenDto,
  ActivateDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RegisterOrganizationDto,
} from './dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(Invitation)
    private invitationRepository: Repository<Invitation>,
    @InjectRepository(PasswordResetToken)
    private passwordResetTokenRepository: Repository<PasswordResetToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private organizationClient: OrganizationClientService,
  ) {}

  async registerOrganization(dto: RegisterOrganizationDto) {
    // Validate email isn't already taken
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email is already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create user with ACTIVE status (no invitation/activation step for owner registration)
    const user = this.userRepository.create({
      email: dto.email,
      password_hash: passwordHash,
      first_name: dto.firstName,
      last_name: dto.lastName,
      status: UserStatus.ACTIVE,
    });

    const savedUser = await this.userRepository.save(user);

    // Call organization-service to create organization
    try {
      const orgResponse = await this.organizationClient.createOrganizationForOwner(
        savedUser.id,
        dto.organizationName,
        dto.organizationAddress,
      );

      // Success - issue tokens immediately
      const accessToken = this.generateAccessToken(savedUser);
      const refreshToken = await this.generateRefreshToken(savedUser);

      return {
        accessToken,
        refreshToken,
        user: {
          id: savedUser.id,
          email: savedUser.email,
          first_name: savedUser.first_name,
          last_name: savedUser.last_name,
        },
        organizationId: orgResponse.organization_id,
        memberId: orgResponse.member_id,
      };
    } catch (error) {
      // Compensating rollback - delete the user we just created
      // This is a best-effort compensating action, not a guaranteed distributed transaction
      await this.userRepository.remove(savedUser);
      
      throw new InternalServerErrorException(
        `Failed to create organization: ${error.message}. User account was not created.`,
      );
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password_hash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check user status
    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException(
        'Account is pending activation. Please check your email for an invitation link.',
      );
    }

    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException(
        'Account has been disabled. Please contact support.',
      );
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException(
        'Account has been deleted. Please contact support.',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const tokenHash = this.hashToken(refreshTokenDto.refreshToken);

    const storedToken = await this.refreshTokenRepository.findOne({
      where: { token_hash: tokenHash },
      relations: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token is expired
    if (new Date() > storedToken.expires_at) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Check if token is revoked
    if (storedToken.revoked) {
      // Possible token reuse attack - revoke all tokens for this user
      await this.revokeAllRefreshTokens(storedToken.user_id);
      throw new UnauthorizedException(
        'Refresh token has been revoked. All sessions have been terminated for security.',
      );
    }

    // Full token rotation: revoke old token and issue new ones
    storedToken.revoked = true;
    await this.refreshTokenRepository.save(storedToken);

    const accessToken = this.generateAccessToken(storedToken.user);
    const newRefreshToken = await this.generateRefreshToken(storedToken.user);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: string , refreshTokenDto: RefreshTokenDto) {
    const tokenHash = this.hashToken(refreshTokenDto.refreshToken);

    const storedToken = await this.refreshTokenRepository.findOne({
      where: { token_hash: tokenHash,
      user_id: userId,
    },
    });
    if (!storedToken) {
    throw new UnauthorizedException('Invalid refresh token');
  }

  if (storedToken.revoked) {
    return {
      message: 'Already logged out',
    };
  }

  storedToken.revoked = true;
  await this.refreshTokenRepository.save(storedToken);

  return {
    message: 'Logged out successfully',
  };
  }

  async activate(activateDto: ActivateDto) {
    const invitation = await this.invitationRepository.findOne({
      where: { token: activateDto.token },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid activation token');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Invitation has already been used');
    }

    if (new Date() > invitation.expires_at) {
      throw new BadRequestException(
        'Invitation has expired. Please request a new invitation to be sent.',
      );
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: invitation.email },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists with this email');
    }

    // Create the user with ACTIVE status
    const passwordHash = await bcrypt.hash(activateDto.password, 10);

    const user = this.userRepository.create({
      email: invitation.email,
      password_hash: passwordHash,
      first_name: '',
      last_name: '',
      status: UserStatus.ACTIVE,
    });

    const savedUser = await this.userRepository.save(user);

    // Call organization-service to create membership
    try {
      const memberResponse = await this.organizationClient.createMemberFromInvitation(
        savedUser.id,
        invitation.organization_id,
        invitation.role,
        invitation.branch_id || undefined,
      );

      if (!memberResponse.success) {
        // Compensating rollback - delete the user we just created
        await this.userRepository.remove(savedUser);
        
        throw new InternalServerErrorException(
          `Failed to create organization membership: ${memberResponse.error_message}. Account was not created.`,
        );
      }

      // Success - update invitation status
      invitation.status = InvitationStatus.ACCEPTED;
      invitation.accepted_at = new Date();
      await this.invitationRepository.save(invitation);

      return {
        message: 'Account activated successfully',
        user: {
          id: savedUser.id,
          email: savedUser.email,
        },
        memberId: memberResponse.member_id,
      };
    } catch (error) {
      // Compensating rollback - delete the user and don't mark invitation as accepted
      await this.userRepository.remove(savedUser);
      
      throw new InternalServerErrorException(
        `Failed to activate account: ${error.message}. Please try again or contact support.`,
      );
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { email: forgotPasswordDto.email },
    });

    // Always return success to prevent email enumeration
    if (!user || user.status !== UserStatus.ACTIVE) {
      return {
        message:
          'If an account exists with this email, a password reset link has been sent.',
      };
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(resetToken);

    const passwordResetToken = this.passwordResetTokenRepository.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    await this.passwordResetTokenRepository.save(passwordResetToken);

    // Queue email job
    await this.emailService.publishEmailJob({
      type: 'PASSWORD_RESET',
      to: user.email,
      data: {
        token: resetToken,
        name: user.first_name || user.email,
      },
    });

    return {
      message:
        'If an account exists with this email, a password reset link has been sent.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const tokenHash = this.hashToken(resetPasswordDto.token);

    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { token_hash: tokenHash },
      relations: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid reset token');
    }

    if (resetToken.used) {
      throw new BadRequestException('Reset token has already been used');
    }

    if (new Date() > resetToken.expires_at) {
      throw new BadRequestException('Reset token has expired');
    }

    // Update password
    const passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    resetToken.user.password_hash = passwordHash;
    await this.userRepository.save(resetToken.user);

    // Mark token as used
    resetToken.used = true;
    await this.passwordResetTokenRepository.save(resetToken);

    // Revoke all refresh tokens for security
    await this.revokeAllRefreshTokens(resetToken.user_id);

    return {
      message:
        'Password has been reset successfully. All active sessions have been terminated.',
    };
  }

  private generateAccessToken(user: User): string {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
  }

  private async generateRefreshToken(user: User): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    const refreshToken = this.refreshTokenRepository.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await this.refreshTokenRepository.save(refreshToken);

    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { user_id: userId, revoked: false },
      { revoked: true },
    );
  }

  // gRPC method
  async validateAccessToken(
    token: string,
  ): Promise<{ sub: string; email: string } | null> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
      return payload;
    } catch (error) {
      return null;
    }
  }
}
