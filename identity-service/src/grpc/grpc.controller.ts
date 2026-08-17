import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';

interface GetUserRequest {
  user_id: string;
}

interface GetUsersByIdsRequest {
  user_ids: string[];
}

interface ValidateTokenRequest {
  access_token: string;
}

interface UserResponse {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
}

interface UsersResponse {
  users: UserResponse[];
}

interface ValidateTokenResponse {
  valid: boolean;
  user_id: string;
  email: string;
}

@Controller()
export class GrpcController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @GrpcMethod('IdentityService', 'GetUser')
  async getUser(data: GetUserRequest): Promise<UserResponse> {
    const user = await this.usersService.findOneById(data.user_id);

    return {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      status: user.status,
    };
  }

  @GrpcMethod('IdentityService', 'GetUsersByIds')
  async getUsersByIds(data: GetUsersByIdsRequest): Promise<UsersResponse> {
    const users = await this.usersService.findByIds(data.user_ids);

    return {
      users: users.map((user) => ({
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        status: user.status,
      })),
    };
  }

  @GrpcMethod('IdentityService', 'ValidateToken')
  async validateToken(
    data: ValidateTokenRequest,
  ): Promise<ValidateTokenResponse> {
    try {
      const payload = await this.authService.validateAccessToken(
        data.access_token,
      );

      if (!payload) {
        return {
          valid: false,
          user_id: '',
          email: '',
        };
      }

      return {
        valid: true,
        user_id: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      return {
        valid: false,
        user_id: '',
        email: '',
      };
    }
  }
}
