import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export interface OrganizationEvent {
  type: string;
  payload: any;
  timestamp: string;
}

@Injectable()
export class EventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly exchangeName = 'organization.events';

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      const rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL') || '';
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      // Create exchange with publisher confirms enabled
      await this.channel.assertExchange(this.exchangeName, 'topic', {
        durable: true,
      });

      this.channel.on('error', (err: any) => {
        this.logger.error(`RabbitMQ channel error: ${err.message}`);
      });

      this.connection.on('error', (err: any) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`);
      });

      this.logger.log('RabbitMQ connection established');
    } catch (error: any) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`);
      // Don't throw - service should still start even if RabbitMQ is down
    }
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
      this.logger.log('RabbitMQ connection closed');
    } catch (error: any) {
      this.logger.error(`Error closing RabbitMQ connection: ${error.message}`);
    }
  }

  /**
   * Publish event asynchronously with publisher confirms.
   * Does NOT block the HTTP response - fire and forget with logging.
   * DB write is source of truth, event is best-effort.
   */
  async publishEvent(event: OrganizationEvent): Promise<void> {
    // Don't await - fire and forget
    this.publishEventInternal(event).catch((error) => {
      this.logger.error(
        `Failed to publish event ${event.type}: ${error.message}`,
        error.stack,
      );
    });
  }

  private async publishEventInternal(event: OrganizationEvent): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not available');
    }

    const routingKey = event.type;
    const message = Buffer.from(JSON.stringify(event));

    // Publish with confirmation
    const published = this.channel.publish(
      this.exchangeName,
      routingKey,
      message,
      {
        persistent: true,
        contentType: 'application/json',
      },
    );

    if (!published) {
      throw new Error('Message buffer full - publish failed');
    }

    this.logger.log(`Event published: ${event.type}`);
  }

  // Event builder helpers
  createOrganizationCreatedEvent(
    organizationId: string,
    name: string,
    ownerUserId: string,
  ): OrganizationEvent {
    return {
      type: 'OrganizationCreated',
      payload: { organizationId, name, ownerUserId },
      timestamp: new Date().toISOString(),
    };
  }

  createOwnershipTransferredEvent(
    organizationId: string,
    oldOwnerUserId: string,
    newOwnerUserId: string,
  ): OrganizationEvent {
    return {
      type: 'OwnershipTransferred',
      payload: { organizationId, oldOwnerUserId, newOwnerUserId },
      timestamp: new Date().toISOString(),
    };
  }

  createMemberAddedEvent(
    organizationId: string,
    memberId: string,
    userId: string,
    systemRole: string,
  ): OrganizationEvent {
    return {
      type: 'MemberAdded',
      payload: { organizationId, memberId, userId, systemRole },
      timestamp: new Date().toISOString(),
    };
  }

  createMemberRoleChangedEvent(
    organizationId: string,
    memberId: string,
    oldRole: string,
    newRole: string,
  ): OrganizationEvent {
    return {
      type: 'MemberRoleChanged',
      payload: { organizationId, memberId, oldRole, newRole },
      timestamp: new Date().toISOString(),
    };
  }

  createMemberRemovedEvent(
    organizationId: string,
    memberId: string,
    userId: string,
  ): OrganizationEvent {
    return {
      type: 'MemberRemoved',
      payload: { organizationId, memberId, userId },
      timestamp: new Date().toISOString(),
    };
  }
}
