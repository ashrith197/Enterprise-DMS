import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { OrganizationService } from '../services/organization.service';

@Controller()
export class OrganizationGrpcController {
  private readonly logger = new Logger(OrganizationGrpcController.name);

  constructor(private readonly organizationService: OrganizationService) {}

  @GrpcMethod('OrganizationService', 'GetOrganization')
  async getOrganization(data: any) {
    this.logger.log(`gRPC GetOrganization called with data: ${JSON.stringify(data)}`);
    return this.organizationService.getOrganizationForGrpc(data.organizationId);
  }

  @GrpcMethod('OrganizationService', 'GetMember')
  async getMember(data: any) {
    this.logger.log(`gRPC GetMember called with data: ${JSON.stringify(data)}`);
    return this.organizationService.getMemberForGrpc(data.memberId);
  }

  @GrpcMethod('OrganizationService', 'IsMemberActive')
  async isMemberActive(data: any) {
    this.logger.log(`gRPC IsMemberActive called with data: ${JSON.stringify(data)}`);
    return this.organizationService.isMemberActive(data.memberId);
  }

  @GrpcMethod('OrganizationService', 'CreateOrganizationForOwner')
  async createOrganizationForOwner(data: any) {
    this.logger.log(`gRPC CreateOrganizationForOwner called with data: ${JSON.stringify(data)}`);
    return this.organizationService.createOrganizationForOwner(
      data.ownerUserId,
      data.organizationName,
      data.organizationAddress,
    );
  }

  @GrpcMethod('OrganizationService', 'CreateMemberFromInvitation')
  async createMemberFromInvitation(data: any) {
    this.logger.log(`gRPC CreateMemberFromInvitation called with data: ${JSON.stringify(data)}`);
    return this.organizationService.createMemberFromInvitation(
      data.userId,
      data.organizationId,
      data.role,
      data.branchId || '',
    );
  }
}
