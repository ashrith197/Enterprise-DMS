import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invitation } from '../entities/invitation.entity';
import { User } from '../entities/user.entity';
import { InvitationStatus } from '../entities/invitation-status.enum';
import { EmailService } from '../email/email.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { QueryInvitationsDto } from './dto/query-invitations.dto';
import { randomBytes } from 'crypto';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import * as xlsx from 'xlsx';

export interface BulkInvitationRow {
  email: string;
  role: string;
  branchId?: string;
}

export interface BulkValidationError {
  row: number;
  errors: string[];
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @InjectRepository(Invitation)
    private invitationsRepository: Repository<Invitation>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private emailService: EmailService,
  ) {}

  async create(
    createInvitationDto: CreateInvitationDto,
    createdBy: string,
  ): Promise<Omit<Invitation, 'token'>> {
    // Check if a User with this email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: createInvitationDto.email },
    });

    if (existingUser) {
      throw new BadRequestException(
        'A user with this email already exists and is already a member of an organization',
      );
    }

    // Check if there's already a PENDING invitation for this email (regardless of organization)
    const pendingInvitation = await this.invitationsRepository.findOne({
      where: {
        email: createInvitationDto.email,
        status: InvitationStatus.PENDING,
      },
    });

    if (pendingInvitation) {
      throw new BadRequestException(
        'A pending invitation already exists for this email address',
      );
    }

    const token = this.generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
    const invitation = this.invitationsRepository.create({
      organization_id: createInvitationDto.organizationId,
      email: createInvitationDto.email,
      role: createInvitationDto.role,
      branch_id: createInvitationDto.branchId,
      token,
      status: InvitationStatus.PENDING,
      expires_at: expiresAt,
      created_by: createdBy,
      resent_count: 0,
    });

    const savedInvitation = await this.invitationsRepository.save(invitation);
    // Publish email job
    await this.emailService.publishEmailJob({
      type: 'INVITATION',
      to: invitation.email,
      data: {
        token,
        organizationName: 'Organization', // TODO: Fetch organization name
        role: invitation.role,
      },
    });

    // Return invitation without token
    const { token: _, ...invitationWithoutToken } = savedInvitation;
    return invitationWithoutToken;
  }

  async bulkCreate(
    file: Express.Multer.File,
    organizationId: string,
    createdBy: string,
  ): Promise<{
    created: number;
    invitations: Array<Omit<Invitation, 'token'>>;
  }> {
    const rows = await this.parseFile(file);

    // Validate all rows first
    const validationErrors = this.validateBulkRows(rows);
    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validationErrors,
      });
    }

    // All valid - create invitations
    const invitations: Array<Omit<Invitation, 'token'>> = [];

    for (const row of rows) {
      const invitation = await this.create(
        {
          organizationId,
          email: row.email,
          role: row.role as any,
          branchId: row.branchId,
        },
        createdBy,
      );
      invitations.push(invitation);
    }

    return {
      created: invitations.length,
      invitations,
    };
  }

  async findAll(query: QueryInvitationsDto): Promise<Invitation[]> {
    const queryBuilder =
      this.invitationsRepository.createQueryBuilder('invitation');

    if (query.organizationId) {
      queryBuilder.andWhere('invitation.organization_id = :organizationId', {
        organizationId: query.organizationId,
      });
    }

    if (query.status) {
      queryBuilder.andWhere('invitation.status = :status', {
        status: query.status,
      });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: string): Promise<Invitation> {
    const invitation = await this.invitationsRepository.findOne({
      where: { id },
    });

    if (!invitation) {
      throw new NotFoundException(`Invitation with ID ${id} not found`);
    }

    return invitation;
  }

  async resend(id: string): Promise<Omit<Invitation, 'token'>> {
    const invitation = await this.findOne(id);

    // Generate new token and reset expiration
    const newToken = this.generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    invitation.token = newToken;
    invitation.expires_at = expiresAt;
    invitation.status = InvitationStatus.PENDING;
    invitation.resent_count += 1;

    const updatedInvitation =
      await this.invitationsRepository.save(invitation);

    // Publish email job with new token
    await this.emailService.publishEmailJob({
      type: 'INVITATION',
      to: invitation.email,
      data: {
        token: newToken,
        organizationName: 'Organization', // TODO: Fetch organization name
        role: invitation.role,
      },
    });

    // Return without token
    const { token: _, ...invitationWithoutToken } = updatedInvitation;
    return invitationWithoutToken;
  }

  async validateToken(token: string): Promise<{
    valid: boolean;
    email?: string;
    expiresAt?: Date;
  }> {
    const invitation = await this.invitationsRepository.findOne({
      where: { token },
    });

    if (!invitation) {
      return { valid: false };
    }

    const now = new Date();
    const isExpired = invitation.expires_at < now;
    const isValid =
      !isExpired && invitation.status === InvitationStatus.PENDING;

    if (!isValid) {
      return { valid: false };
    }

    return {
      valid: true,
      email: invitation.email,
      expiresAt: invitation.expires_at,
    };
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async parseFile(
    file: Express.Multer.File,
  ): Promise<BulkInvitationRow[]> {
    const mimeType = file.mimetype;

    if (mimeType === 'text/csv' || file.originalname.endsWith('.csv')) {
      return this.parseCSV(file.buffer);
    } else if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.endsWith('.xlsx')
    ) {
      return this.parseXLSX(file.buffer);
    } else {
      throw new BadRequestException(
        'Unsupported file format. Please upload CSV or XLSX.',
      );
    }
  }

  private async parseCSV(buffer: Buffer): Promise<BulkInvitationRow[]> {
    return new Promise((resolve, reject) => {
      const rows: BulkInvitationRow[] = [];
      const stream = Readable.from(buffer);

      stream
        .pipe(
          parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
          }),
        )
        .on('data', (row) => {
          rows.push({
            email: row.email,
            role: row.role,
            branchId: row.branchId || undefined,
          });
        })
        .on('end', () => resolve(rows))
        .on('error', (error) => reject(error));
    });
  }

  private parseXLSX(buffer: Buffer): BulkInvitationRow[] {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    return data.map((row: any) => ({
      email: row.email,
      role: row.role,
      branchId: row.branchId || undefined,
    }));
  }

  private validateBulkRows(rows: BulkInvitationRow[]): BulkValidationError[] {
    const errors: BulkValidationError[] = [];
    const validRoles = ['BRANCH_ADMIN', 'EMPLOYEE'];

    rows.forEach((row, index) => {
      const rowErrors: string[] = [];

      if (!row.email || !this.isValidEmail(row.email)) {
        rowErrors.push('Invalid email address');
      }

      if (!row.role || !validRoles.includes(row.role.toUpperCase())) {
        rowErrors.push(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
      }

      if (row.branchId && !this.isValidUUID(row.branchId)) {
        rowErrors.push('Invalid branchId format (must be UUID)');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: index + 2, // +2 because CSV has header row and is 1-indexed
          errors: rowErrors,
        });
      }
    });

    return errors;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
