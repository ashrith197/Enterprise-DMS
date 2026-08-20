import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Organization } from './organization.entity';
import { BranchAdminHistory } from './branch-admin-history.entity';

export enum SystemRole {
  OWNER = 'OWNER',
  BRANCH_ADMIN = 'BRANCH_ADMIN',
  EMPLOYEE = 'EMPLOYEE',
}

export enum MemberStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  REMOVED = 'REMOVED',
}

@Entity('organization_members')
@Index(['userId'], { unique: true }) // Global unique constraint - user can only belong to one org
export class OrganizationMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  // No FK - this references a Users row in Identity Service's separate database
  // Validated via gRPC call, not DB-level FK
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({
    type: 'enum',
    enum: SystemRole,
    name: 'system_role',
  })
  systemRole: SystemRole;

  @Column({
    type: 'enum',
    enum: MemberStatus,
    default: MemberStatus.ACTIVE,
  })
  status: MemberStatus;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  @ManyToOne(() => Organization, (org) => org.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @OneToMany(() => BranchAdminHistory, (history) => history.organizationMember)
  branchAdminHistory: BranchAdminHistory[];
}
