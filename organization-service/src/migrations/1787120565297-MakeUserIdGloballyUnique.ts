import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeUserIdGloballyUnique1787120565297 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Clean up any duplicate user_id entries from test data (Phase 1/2)
        // Keep only the first membership for each user_id
        await queryRunner.query(
            `DELETE FROM "organization_members" 
             WHERE id NOT IN (
                 SELECT DISTINCT ON (user_id) id 
                 FROM "organization_members" 
                 ORDER BY user_id, joined_at ASC
             )`
        );
        
        // Drop the existing composite unique constraint on (organization_id, user_id)
        await queryRunner.query(
            `DROP INDEX IF EXISTS "IDX_organization_members_organization_id_user_id"`
        );
        
        // Add a global unique constraint on user_id alone
        // This enforces that a user can belong to at most one organization
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_organization_members_user_id" ON "organization_members" ("user_id")`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the global unique constraint
        await queryRunner.query(
            `DROP INDEX IF EXISTS "IDX_organization_members_user_id"`
        );
        
        // Restore the old composite unique constraint
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_organization_members_organization_id_user_id" ON "organization_members" ("organization_id", "user_id")`
        );
    }

}
