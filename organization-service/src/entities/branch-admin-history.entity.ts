import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationMember } from './organization-member.entity';

@Entity('branch_admin_history')
export class BranchAdminHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // No FK - Branch Service owns this, doesn't exist yet
  @Column({ type: 'uuid', name: 'branch_id' })
  branchId: string;

  @Column({ type: 'uuid', name: 'organization_member_id' })
  organizationMemberId: string;

  @Column({ type: 'uuid', name: 'assigned_by' })
  assignedBy: string;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'removed_at' })
  removedAt: Date;

  @ManyToOne(() => OrganizationMember, (member) => member.branchAdminHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_member_id' })
  organizationMember: OrganizationMember;
}
