import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import {
  OrganizationMember,
  SystemRole,
  MemberStatus,
} from '../entities/organization-member.entity';
import { IdentityClientService } from './identity-client.service';
import { EventService } from './event.service';
import { UpdateOrganizationDto } from '../dto/update-organization.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';
import { TransferOwnershipDto } from '../dto/transfer-ownership.dto';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private memberRepository: Repository<OrganizationMember>,
    private dataSource: DataSource,
    private identityClient: IdentityClientService,
    private eventService: EventService,
  ) {}

  async getOrganization(orgId: string) {
    const organization = await this.organizationRepository.findOne({
      where: { id: orgId },
      relations: {
        members: true,
      },
    });

    if (!organization) {
      throw new NotFoundException(`Organization with ID ${orgId} not found`);
    }

    return organization;
  }

  async updateOrganization(orgId: string, dto: UpdateOrganizationDto) {
    const organization = await this.getOrganization(orgId);

    if (dto.name) organization.name = dto.name;
    if (dto.address !== undefined) organization.address = dto.address;

    return this.organizationRepository.save(organization);
  }

  async deleteOrganization(orgId: string) {
    const organization = await this.getOrganization(orgId);
    // Hard delete - cascade behavior on OrganizationMembers and BranchAdminHistory is correct
    await this.organizationRepository.remove(organization);
    return { message: 'Organization deleted successfully' };
  }

  async transferOwnership(orgId: string, dto: TransferOwnershipDto) {
    // Validate new owner exists via gRPC
    await this.identityClient.getUser(dto.newOwnerUserId);

    const organization = await this.getOrganization(orgId);

    // Find current owner
    const currentOwner = await this.memberRepository.findOne({
      where: {
        organizationId: orgId,
        systemRole: SystemRole.OWNER,
      },
    });

    if (!currentOwner) {
      throw new NotFoundException('Current owner not found');
    }

    // Find new owner member
    const newOwnerMember = await this.memberRepository.findOne({
      where: {
        organizationId: orgId,
        userId: dto.newOwnerUserId,
        status: MemberStatus.ACTIVE,
      },
    });

    if (!newOwnerMember) {
      throw new BadRequestException(
        'New owner must be an ACTIVE member of this organization',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Demote old owner to BRANCH_ADMIN (not EMPLOYEE - ex-owner retains elevated privileges)
      currentOwner.systemRole = SystemRole.BRANCH_ADMIN;
      await queryRunner.manager.save(currentOwner);

      // Promote new owner
      newOwnerMember.systemRole = SystemRole.OWNER;
      await queryRunner.manager.save(newOwnerMember);

      // Update organization owner reference
      organization.ownerMemberId = newOwnerMember.id;
      await queryRunner.manager.save(organization);

      await queryRunner.commitTransaction();

      // Publish event asynchronously
      await this.eventService.publishEvent(
        this.eventService.createOwnershipTransferredEvent(
          orgId,
          currentOwner.userId,
          dto.newOwnerUserId,
        ),
      );

      return {
        message: 'Ownership transferred successfully',
        oldOwner: currentOwner,
        newOwner: newOwnerMember,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to transfer ownership: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getMembers(orgId: string) {
    await this.getOrganization(orgId); // Verify org exists

    return this.memberRepository.find({
      where: { organizationId: orgId },
      order: { joinedAt: 'DESC' },
    });
  }

  async updateMemberRole(orgId: string, memberId: string, dto: UpdateMemberRoleDto) {
    // Reject OWNER role through this endpoint
    if (dto.systemRole === SystemRole.OWNER) {
      throw new BadRequestException(
        'Cannot set OWNER role through this endpoint. Use transfer-ownership instead.',
      );
    }

    const member = await this.memberRepository.findOne({
      where: { id: memberId, organizationId: orgId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Prevent modifying current OWNER's role through this endpoint
    if (member.systemRole === SystemRole.OWNER) {
      throw new BadRequestException(
        'Cannot change OWNER role through this endpoint. Use transfer-ownership instead.',
      );
    }

    const oldRole = member.systemRole;
    member.systemRole = dto.systemRole;

    const updatedMember = await this.memberRepository.save(member);

    // Publish event asynchronously
    await this.eventService.publishEvent(
      this.eventService.createMemberRoleChangedEvent(
        orgId,
        memberId,
        oldRole,
        dto.systemRole,
      ),
    );

    return updatedMember;
  }

  async removeMember(orgId: string, memberId: string) {
    const member = await this.memberRepository.findOne({
      where: { id: memberId, organizationId: orgId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Reject if member is current OWNER
    if (member.systemRole === SystemRole.OWNER) {
      throw new BadRequestException(
        'Cannot remove the OWNER. Transfer ownership first.',
      );
    }

    // Soft delete - set status to REMOVED (don't hard-delete for audit purposes)
    member.status = MemberStatus.REMOVED;
    const removedMember = await this.memberRepository.save(member);

    // Publish event asynchronously
    await this.eventService.publishEvent(
      this.eventService.createMemberRemovedEvent(
        orgId,
        memberId,
        member.userId,
      ),
    );

    return removedMember;
  }

  async getDashboard(orgId: string) {
    await this.getOrganization(orgId); // Verify org exists

    const members = await this.memberRepository.find({
      where: { organizationId: orgId },
    });

    const totalMembers = members.length;

    const countByRole = members.reduce(
      (acc, member) => {
        acc[member.systemRole] = (acc[member.systemRole] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const countByStatus = members.reduce(
      (acc, member) => {
        acc[member.status] = (acc[member.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalMembers,
      countByRole,
      countByStatus,
    };
  }

  async getBranchAnalytics(orgId: string) {
    await this.getOrganization(orgId); // Verify org exists

    // Branch Service doesn't exist yet - return honest placeholder
    return {
      message: 'Branch data not yet available - Branch Service not implemented',
    };
  }

  // gRPC methods
  async getOrganizationForGrpc(organizationId: string) {
    const org = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return {
      id: org.id,
      name: org.name,
      owner_member_id: org.ownerMemberId,
    };
  }

  async getMemberForGrpc(memberId: string) {
    const member = await this.memberRepository.findOne({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return {
      id: member.id,
      organization_id: member.organizationId,
      user_id: member.userId,
      system_role: member.systemRole,
      status: member.status,
    };
  }

  async isMemberActive(memberId: string) {
    const member = await this.memberRepository.findOne({
      where: { id: memberId },
    });

    return {
      active: member ? member.status === MemberStatus.ACTIVE : false,
    };
  }

  // New gRPC methods for Phase 2.5
  async createOrganizationForOwner(
    ownerUserId: string,
    organizationName: string,
    organizationAddress: string,
  ) {
    // Note: caller (identity-service) already validated user exists
    this.logger.log(`Creating org for owner: userId=${ownerUserId}, name=${organizationName}, address=${organizationAddress}`);
    
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create organization using INSERT query directly
      const valuesToInsert = {
        name: organizationName,
        address: organizationAddress,
      };
      this.logger.log(`Values to insert: ${JSON.stringify(valuesToInsert)}`);
      
      const orgInsertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Organization)
        .values(valuesToInsert)
        .returning('*')
        .execute();
      
      this.logger.log(`Insert result: ${JSON.stringify(orgInsertResult.generatedMaps[0])}`);
      const organization = orgInsertResult.generatedMaps[0] as Organization;

      // Create owner member
      const memberInsertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(OrganizationMember)
        .values({
          organizationId: organization.id,
          userId: ownerUserId,
          systemRole: SystemRole.OWNER,
          status: MemberStatus.ACTIVE,
        })
        .returning('*')
        .execute();
      
      const ownerMember = memberInsertResult.generatedMaps[0] as OrganizationMember;

      // Update organization with owner member ID
      await queryRunner.manager
        .createQueryBuilder()
        .update(Organization)
        .set({ ownerMemberId: ownerMember.id })
        .where('id = :id', { id: organization.id })
        .execute();

      await queryRunner.commitTransaction();

      // Publish event asynchronously (fire and forget)
      await this.eventService.publishEvent(
        this.eventService.createOrganizationCreatedEvent(
          organization.id,
          organizationName,
          ownerUserId,
        ),
      );

      this.logger.log(`Returning: org_id=${organization.id}, member_id=${ownerMember.id}`);

      return {
        organizationId: organization.id,
        memberId: ownerMember.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to create organization for owner: ${error.message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createMemberFromInvitation(
    userId: string,
    organizationId: string,
    role: string,
    branchId: string,
  ) {
    try {
      this.logger.log(`createMemberFromInvitation: checking for existing membership for userId=${userId}`);
      
      // Check if user already has a membership anywhere
      // This is a defense-in-depth check - the global unique constraint will also catch this
      const existingMembership = await this.memberRepository.findOne({
        where: { userId },
      });

      this.logger.log(`existingMembership result: ${JSON.stringify(existingMembership)}`);

      if (existingMembership) {
        this.logger.log(`User ${userId} already has membership in org ${existingMembership.organizationId}`);
        return {
          memberId: '',
          success: false,
          errorMessage: `User ${userId} already belongs to organization ${existingMembership.organizationId}`,
        };
      }

      // Verify organization exists
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });

      if (!organization) {
        return {
          memberId: '',
          success: false,
          errorMessage: `Organization ${organizationId} not found`,
        };
      }

      // Map role string to enum
      let systemRole: SystemRole;
      if (role === 'BRANCH_ADMIN') {
        systemRole = SystemRole.BRANCH_ADMIN;
      } else if (role === 'EMPLOYEE') {
        systemRole = SystemRole.EMPLOYEE;
      } else {
        return {
          memberId: '',
          success: false,
          errorMessage: `Invalid role: ${role}. Must be BRANCH_ADMIN or EMPLOYEE`,
        };
      }

      // Create member
      const member = this.memberRepository.create({
        organizationId,
        userId,
        systemRole,
        status: MemberStatus.ACTIVE,
      });

      const savedMember = await this.memberRepository.save(member);

      // Publish event asynchronously
      await this.eventService.publishEvent(
        this.eventService.createMemberAddedEvent(
          organizationId,
          savedMember.id,
          userId,
          systemRole,
        ),
      );

      return {
        memberId: savedMember.id,
        success: true,
        errorMessage: '',
      };
    } catch (error) {
      this.logger.error(
        `Failed to create member from invitation: ${error.message}`,
      );
      
      // Check if it's a unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('user_id')) {
        return {
          memberId: '',
          success: false,
          errorMessage: `User ${userId} already belongs to an organization`,
        };
      }

      return {
        memberId: '',
        success: false,
        errorMessage: error.message || 'Unknown error occurred',
      };
    }
  }
}
