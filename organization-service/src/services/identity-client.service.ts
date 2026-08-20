import { Injectable, Logger, BadRequestException, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createGrpcClient } from '../common/grpc-client.factory';

@Injectable()
export class IdentityClientService {
  private readonly logger = new Logger(IdentityClientService.name);
  private readonly client: any;

  constructor(private configService: ConfigService) {
    const grpcUrl = this.configService.get<string>('IDENTITY_SERVICE_GRPC_URL') || 'localhost:5001';
    this.client = createGrpcClient('identity.proto', 'IdentityService', grpcUrl);
  }

  async getUser(userId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.GetUser({ user_id: userId }, (error: any, response: any) => {
        if (error) {
          this.logger.error(`gRPC GetUser failed for userId ${userId}: ${error.message}`);
          
          if (error.code === 5) { // NOT_FOUND
            reject(new BadRequestException(`User with ID ${userId} not found in Identity Service`));
          } else {
            reject(new BadGatewayException('Identity Service unavailable'));
          }
          return;
        }
        resolve(response);
      });
    });
  }

  async getUsersByIds(userIds: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.GetUsersByIds({ user_ids: userIds }, (error: any, response: any) => {
        if (error) {
          this.logger.error(`gRPC GetUsersByIds failed: ${error.message}`);
          reject(new BadGatewayException('Identity Service unavailable'));
          return;
        }
        resolve(response);
      });
    });
  }
}
