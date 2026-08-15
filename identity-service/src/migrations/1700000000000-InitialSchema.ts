import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_status enum
    await queryRunner.query(`
      CREATE TYPE "user_status_enum" AS ENUM('PENDING', 'ACTIVE', 'DISABLED', 'DELETED')
    `);

    // Create invitation_role enum
    await queryRunner.query(`
      CREATE TYPE "invitation_role_enum" AS ENUM('BRANCH_ADMIN', 'EMPLOYEE')
    `);

    // Create invitation_status enum
    await queryRunner.query(`
      CREATE TYPE "invitation_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'EXPIRED', 'RESENT')
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "first_name" character varying(255) NOT NULL,
        "last_name" character varying(255) NOT NULL,
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255),
        "phone" character varying(50),
        "status" "user_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // Create index on email
    await queryRunner.query(`
      CREATE INDEX "IDX_users_email" ON "users" ("email")
    `);

    // Create invitations table
    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "email" character varying(255) NOT NULL,
        "role" "invitation_role_enum" NOT NULL,
        "branch_id" uuid,
        "token" character varying(255) NOT NULL,
        "status" "invitation_status_enum" NOT NULL DEFAULT 'PENDING',
        "expires_at" TIMESTAMP NOT NULL,
        "accepted_at" TIMESTAMP,
        "created_by" uuid NOT NULL,
        "resent_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_invitations_token" UNIQUE ("token")
      )
    `);

    // Create index on token
    await queryRunner.query(`
      CREATE INDEX "IDX_invitations_token" ON "invitations" ("token")
    `);

    // Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(255) NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_refresh_tokens_user_id" FOREIGN KEY ("user_id") 
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create password_reset_tokens table
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(255) NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "used" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_password_reset_tokens_user_id" FOREIGN KEY ("user_id") 
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "IDX_invitations_token"`);
    await queryRunner.query(`DROP TABLE "invitations"`);
    await queryRunner.query(`DROP INDEX "IDX_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "invitation_status_enum"`);
    await queryRunner.query(`DROP TYPE "invitation_role_enum"`);
    await queryRunner.query(`DROP TYPE "user_status_enum"`);
  }
}
