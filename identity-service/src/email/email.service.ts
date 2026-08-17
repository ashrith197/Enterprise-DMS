import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import * as nodemailer from 'nodemailer';

export interface EmailJob {
  type: 'PASSWORD_RESET' | 'INVITATION';
  to: string;
  data: any;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private transporter: nodemailer.Transporter;
  private readonly queueName = 'email-jobs';

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connectRabbitMQ();
    await this.setupEmailTransporter();
    await this.startConsumer();
  }

  private async connectRabbitMQ() {
    try {
      const rabbitmqUrl =
        this.configService.get<string>('RABBITMQ_URL') ||
        'amqp://localhost:5672';
      const connection = await amqp.connect(rabbitmqUrl);
      this.connection = connection as any;
      this.channel = await (this.connection as any).createChannel();
      await this.channel.assertQueue(this.queueName, { durable: true });
      this.logger.log(
        `Connected to RabbitMQ and queue "${this.queueName}" is ready`,
      );
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

private async setupEmailTransporter() {
  const smtpHost = this.configService.get<string>('SMTP_HOST');
  const smtpPort = Number(
    this.configService.get<string>('SMTP_PORT') || '587',
  );
  const smtpUser = this.configService.get<string>('SMTP_USER');
  const smtpPass = this.configService.get<string>('SMTP_PASS');
  const emailFrom = this.configService.get<string>('EMAIL_FROM');

  if (!smtpHost || !smtpUser || !smtpPass) {
    this.logger.warn(
      'SMTP configuration incomplete. Emails will be logged to console.',
    );
    return;
  }

  this.transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  this.logger.log(
    `Email transporter configured: ${smtpHost}:${smtpPort} (${smtpUser})`,
  );

  try {
    await this.transporter.verify();
    this.logger.log('SMTP connection verified successfully');
  } catch (error) {
    this.logger.error('SMTP connection verification failed', error);
    throw error;
  }
}

  async publishEmailJob(job: EmailJob): Promise<void> {
    try {
      const message = Buffer.from(JSON.stringify(job));
      this.channel.sendToQueue(this.queueName, message, { persistent: true });
      this.logger.log(`Email job published: ${job.type} to ${job.to}`);
    } catch (error) {
      this.logger.error('Failed to publish email job', error);
      throw error;
    }
  }

  private async startConsumer() {
    try {
      await this.channel.consume(
        this.queueName,
        async (msg) => {
          if (msg) {
            try {
              const job: EmailJob = JSON.parse(msg.content.toString());
              await this.processEmailJob(job);
              this.channel.ack(msg);
            } catch (error) {
              this.logger.error('Error processing email job', error);
              this.channel.nack(msg, false, false);
            }
          }
        },
        { noAck: false },
      );
      this.logger.log('Email consumer started');
    } catch (error) {
      this.logger.error('Failed to start email consumer', error);
      throw error;
    }
  }

  private async processEmailJob(job: EmailJob): Promise<void> {
    try {
      switch (job.type) {
        case 'PASSWORD_RESET':
          await this.sendPasswordResetEmail(job.to, job.data);
          break;
        case 'INVITATION':
          await this.sendInvitationEmail(job.to, job.data);
          break;
        default:
          this.logger.warn(`Unknown email job type: ${job.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process email job: ${job.type}`, error);
      throw error;
    }
  }

  private async sendPasswordResetEmail(
    to: string,
    data: { token: string; name: string },
  ): Promise<void> {
    const resetLink = `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/reset-password?token=${data.token}`;

    const subject = 'Password Reset Request';
    const html = `
      <h1>Password Reset Request</h1>
      <p>Hello ${data.name},</p>
      <p>You requested to reset your password. Click the link below to proceed:</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    await this.sendEmail(to, subject, html, resetLink);
  }

  private async sendInvitationEmail(
    to: string,
    data: { token: string; organizationName: string; role: string },
  ): Promise<void> {
    const invitationLink = `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/activate?token=${data.token}`;

    const subject = `Invitation to join ${data.organizationName}`;
    const html = `
      <h1>You've been invited!</h1>
      <p>You have been invited to join ${data.organizationName} as a ${data.role}.</p>
      <p>Click the link below to activate your account:</p>
      <a href="${invitationLink}">${invitationLink}</a>
      <p>This invitation will expire in 7 days.</p>
    `;

    await this.sendEmail(to, subject, html, invitationLink);
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    link: string,
  ): Promise<void> {
    if (this.transporter) {
      // Send via SMTP
      await this.transporter.sendMail({
        from: this.configService.get<string>('EMAIL_FROM') || 'noreply@dms.com',
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } else {
      // Console fallback
      this.logger.log('='.repeat(80));
      this.logger.log('EMAIL (Console Fallback)');
      this.logger.log('='.repeat(80));
      this.logger.log(`To: ${to}`);
      this.logger.log(`Subject: ${subject}`);
      this.logger.log(`Link: ${link}`);
      this.logger.log(`HTML Content:\n${html}`);
      this.logger.log('='.repeat(80));
    }
  }
}
