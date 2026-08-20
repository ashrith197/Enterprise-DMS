import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { OrganizationService } from '../services/organization.service';
import { UpdateOrganizationDto } from '../dto/update-organization.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';
import { TransferOwnershipDto } from '../dto/transfer-ownership.dto';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get(':orgId')
  async getOrganization(@Param('orgId') orgId: string) {
    return this.organizationService.getOrganization(orgId);
  }

  @Patch(':orgId')
  async updateOrganization(
    @Param('orgId') orgId: string,
    @Body(ValidationPipe) dto: UpdateOrganizationDto,
  ) {
    return this.organizationService.updateOrganization(orgId, dto);
  }

  @Delete(':orgId')
  @HttpCode(HttpStatus.OK)
  async deleteOrganization(@Param('orgId') orgId: string) {
    return this.organizationService.deleteOrganization(orgId);
  }

  @Post(':orgId/transfer-ownership')
  @HttpCode(HttpStatus.OK)
  async transferOwnership(
    @Param('orgId') orgId: string,
    @Body(ValidationPipe) dto: TransferOwnershipDto,
  ) {
    return this.organizationService.transferOwnership(orgId, dto);
  }

  @Get(':orgId/members')
  async getMembers(@Param('orgId') orgId: string) {
    return this.organizationService.getMembers(orgId);
  }

  @Patch(':orgId/members/:memberId')
  async updateMemberRole(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Body(ValidationPipe) dto: UpdateMemberRoleDto,
  ) {
    return this.organizationService.updateMemberRole(orgId, memberId, dto);
  }

  @Delete(':orgId/members/:memberId')
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.organizationService.removeMember(orgId, memberId);
  }

  @Get(':orgId/dashboard')
  async getDashboard(@Param('orgId') orgId: string) {
    return this.organizationService.getDashboard(orgId);
  }

  @Get(':orgId/branches/analytics')
  async getBranchAnalytics(@Param('orgId') orgId: string) {
    return this.organizationService.getBranchAnalytics(orgId);
  }
}
