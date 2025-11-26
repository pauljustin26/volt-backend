// backend/src/users/users.controller.ts
import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

interface AuthRequest extends Request {
  user?: any;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Initialize a new user document (called after login)
   * GET /users/init
   */
  @UseGuards(FirebaseAuthGuard)
  @Get('init')
  async initializeUser(@Req() req: AuthRequest) {
    const { uid, email } = req.user;
    return await this.usersService.initializeUser(uid, email);
  }

  /**
   * Get the current authenticated user profile
   * GET /users/me
   */
  @UseGuards(FirebaseAuthGuard)
  @Get('me')
  async getProfile(@Req() req: AuthRequest) {
    const { uid } = req.user;
    return await this.usersService.getUserProfile(uid);
  }

  /**
   * Update the current user's profile
   * PUT /users/me
   */
  @UseGuards(FirebaseAuthGuard)
  @Put('me')
  async updateProfile(@Req() req: AuthRequest, @Body() body: any) {
    const { uid } = req.user;
    return await this.usersService.updateUserProfile(uid, body);
  }
}
