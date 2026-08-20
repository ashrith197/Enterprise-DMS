import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrganizationSchema1787055471428 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum types
        await queryRunner.query(`
            CREATE TYPE "system_role_enum" AS ENUM ('OWNER', 'BRANCH_ADMIN', 'EMPLOYEE')
        `);

        await queryRunner.query(`
            CREATE TYPE "member_status_enum" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED')
        `);

        // Create organizations table
        await queryRunner.query(`
            CREATE TABLE "organizations" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "address" varchar,
                "owner_member_id" uuid,
                "created_at" timestamp NOT NULL DEFAULT now(),
                "updated_at" timestamp NOT NULL DEFAULT now()
            )
        `);

        // Create organization_members table
        await queryRunner.query(`
            CREATE TABLE "organization_members" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "system_role" system_role_enum NOT NULL,
                "status" member_status_enum NOT NULL DEFAULT 'ACTIVE',
                "joined_at" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "FK_organization_members_organization" 
                    FOREIGN KEY ("organization_id") 
                    REFERENCES "organizations"("id") 
                    ON DELETE CASCADE,
                CONSTRAINT "UQ_organization_user" UNIQUE ("organization_id", "user_id")
            )
        `);

        // Create index on organization_id and user_id
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_organization_user" 
            ON "organization_members" ("organization_id", "user_id")
        `);

        // Create branch_admin_history table
        await queryRunner.query(`
            CREATE TABLE "branch_admin_history" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "branch_id" uuid NOT NULL,
                "organization_member_id" uuid NOT NULL,
                "assigned_by" uuid NOT NULL,
                "assigned_at" timestamp NOT NULL DEFAULT now(),
                "removed_at" timestamp,
                CONSTRAINT "FK_branch_admin_history_member" 
                    FOREIGN KEY ("organization_member_id") 
                    REFERENCES "organization_members"("id") 
                    ON DELETE CASCADE
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order
        await queryRunner.query(`DROP TABLE "branch_admin_history"`);
        await queryRunner.query(`DROP INDEX "IDX_organization_user"`);
        await queryRunner.query(`DROP TABLE "organization_members"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
        
        // Drop enum types
        await queryRunner.query(`DROP TYPE "member_status_enum"`);
        await queryRunner.query(`DROP TYPE "system_role_enum"`);
    }

}

