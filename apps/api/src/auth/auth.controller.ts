import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from './auth.constants';
import type { AuthenticatedRequest } from './authenticated-request';
import { AuthService } from './auth.service';
import type { AuthenticatedUser, LoginBody } from './auth.types';
import { SessionAuthGuard } from './session-auth.guard';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' }> {
    const token = await this.authService.login(body?.email, body?.password);

    response.cookie(SESSION_COOKIE_NAME, token, {
      ...sessionCookieOptions(),
      maxAge: SESSION_TTL_MS,
    });

    return { status: 'ok' };
  }

  @Post('auth/logout')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (!request.sessionToken) {
      throw new UnauthorizedException();
    }

    await this.authService.revokeSession(request.sessionToken);
    response.clearCookie(
      SESSION_COOKIE_NAME,
      sessionCookieOptions(),
    );
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  getMe(@Req() request: AuthenticatedRequest): AuthenticatedUser {
    if (!request.currentUser) {
      throw new UnauthorizedException();
    }

    return request.currentUser;
  }
}
