import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { InvitationRole } from './invitation-role.enum';
import { InvitationStatus } from './invitation-status.enum';

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({
    type: 'enum',
    enum: InvitationRole,
  })
  role: InvitationRole;

  @Column({ type: 'uuid', nullable: true })
  branch_id: string;

  @Index()
  @Column({ type: 'varchar', length: 255, unique: true })
  token: string;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  accepted_at: Date;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'integer', default: 0 })
  resent_count: number;

  @CreateDateColumn()
  created_at: Date;
}
