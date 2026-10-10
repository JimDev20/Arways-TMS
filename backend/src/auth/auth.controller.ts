import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, RegisterDto } from './dto.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { Roles } from '../common/roles.decorator.js';
import { RolesGuard } from '../common/roles.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { JwtPayload } from '../common/roles.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.auth.login(dto.email, dto.password, req.ip);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Owner')
  register(@Body() dto: RegisterDto, @CurrentUser() user: JwtPayload) {
    return this.auth.register(dto, user.role);
  }

  @Post('bootstrap')
  async bootstrap(@Body() dto: RegisterDto) {
    // First user on a fresh database must be the Owner: a first Driver or
    // Client could never create the Owner account afterwards (register is
    // Owner-only once the table is non-empty) and the system would lock out.
    // P0 #10: hard-block once any user exists (service also blocks; this is
    // defense-in-depth). Remove this endpoint in production; use a CLI script.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_BOOTSTRAP !== '1') {
      throw new (await import('@nestjs/common')).ForbiddenException(
        'Bootstrap is disabled in production. Create the first Owner with the server CLI script.',
      );
    }
    return this.auth.register({ ...dto, role: 'Owner' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
