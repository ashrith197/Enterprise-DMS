import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createGrpcClient } from './grpc-client.factory';

@Injectable()
export class OrganizationClientService implements OnModuleInit {
  private readonly logger = new Logger(OrganizationClientService.name);
  private client: any;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>(
      'ORGANIZATION_SERVICE_GRPC_URL',
      'localhost:5002',
    );
    this.logger.log(`Connecting to Organization Service at ${url}`);
    this.client = createGrpcClient(
      'organization.proto',
      'OrganizationService',
      url,
    );
  }

  async createOrganizationForOwner(
    ownerUserId: string,
    organizationName: string,
    organizationAddress: string,
  ): Promise<{ organization_id: string; member_id: string }> {
    return new Promise((resolve, reject) => {
      this.client.CreateOrganizationForOwner(
        {
          owner_user_id: ownerUserId,
          organization_name: organizationName,
          organization_address: organizationAddress,
        },
        (error: any, response: any) => {
          if (error) {
            this.logger.error(
              `gRPC CreateOrganizationForOwner failed: ${error.message}`,
            );
            reject(error);
          } else {
            resolve(response);
          }
        },
      );
    });
  }

  async createMemberFromInvitation(
    userId: string,
    organizationId: string,
    role: string,
    branchId?: string,
  ): Promise<{ member_id: string; success: boolean; error_message: string }> {
    return new Promise((resolve, reject) => {
      this.client.CreateMemberFromInvitation(
        {
          user_id: userId,
          organization_id: organizationId,
          role,
          branch_id: branchId || '',
        },
        (error: any, response: any) => {
          if (error) {
            this.logger.error(
              `gRPC CreateMemberFromInvitation failed: ${error.message}`,
            );
            reject(error);
          } else {
            resolve(response);
          }
        },
      );
    });
  }
}
