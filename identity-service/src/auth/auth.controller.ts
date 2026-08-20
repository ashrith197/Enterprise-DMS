import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard'; // adjust path
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshTokenDto,
  ActivateDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RegisterOrganizationDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-organization')
  @HttpCode(HttpStatus.CREATED)
  async registerOrganization(@Body() registerDto: RegisterOrganizationDto) {
    return this.authService.registerOrganization(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req, @Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.logout(req.user.id,refreshTokenDto);
  }

  @Post('activate')
  @HttpCode(HttpStatus.CREATED)
  async activate(@Body() activateDto: ActivateDto) {
    return this.authService.activate(activateDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
