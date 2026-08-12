import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.connectWithRetry();
    const [identity] = await this.$queryRaw<
      Array<{
        database: string;
        schema: string;
        user: string;
        serverAddress: string | null;
        serverPort: number | null;
      }>
    >`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        current_user AS user,
        inet_server_addr()::text AS "serverAddress",
        inet_server_port() AS "serverPort"
    `;
    const configured = safeDatabaseTarget(process.env.DATABASE_URL);
    this.logger.log(
      `Connected to PostgreSQL: configured=${configured}; runtime=${identity?.user}@${identity?.database}/${identity?.schema} server=${identity?.serverAddress ?? 'proxy'}:${identity?.serverPort ?? 'unknown'}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  private async connectWithRetry(): Promise<void> {
    const attempts = 6;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (attempt === attempts) throw error;
        const delayMs = attempt * 5_000;
        this.logger.warn(
          `PostgreSQL connection attempt ${attempt}/${attempts} failed (${safeErrorCode(error)}); retrying in ${delayMs / 1_000}s.`,
        );
        await delay(delayMs);
      }
    }
  }
}

/** Render enough of DATABASE_URL to spot a wrong Neon project/branch without
 * ever putting its username, password, query tokens, or full URL in logs. */
function safeDatabaseTarget(value: string | undefined): string {
  if (!value) return 'missing';
  try {
    const url = new URL(value);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function safeErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'unknown';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'unknown';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
