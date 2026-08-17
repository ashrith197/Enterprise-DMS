import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto, QueryInvitationsDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createInvitationDto: CreateInvitationDto,
    @Request() req,
  ) {
    return this.invitationsService.create(createInvitationDto, req.user.id);
  }

  @Post('bulk')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async bulkCreate(
    @UploadedFile() file: Express.Multer.File,
    @Body('organizationId') organizationId: string,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }

    return this.invitationsService.bulkCreate(
      file,
      organizationId,
      req.user.id,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryInvitationsDto) {
    return this.invitationsService.findAll(query);
  }

  @Get('validate/:token')
  async validateToken(@Param('token') token: string) {
    return this.invitationsService.validateToken(token);
  }

  @Get(':invitationId')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('invitationId') invitationId: string) {
    return this.invitationsService.findOne(invitationId);
  }

  @Post(':invitationId/resend')
  @UseGuards(JwtAuthGuard)
  async resend(@Param('invitationId') invitationId: string) {
    return this.invitationsService.resend(invitationId);
  }
}
