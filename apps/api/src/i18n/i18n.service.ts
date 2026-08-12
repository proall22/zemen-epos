import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BASE_STRINGS,
  DEFAULT_LANGUAGE,
  flattenBundle,
  nestBundle,
  type LanguageCode,
} from '@eirms/i18n-strings';
import { Prisma, type Language, type TranslationOverride } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLanguageDto,
  UpdateLanguageDto,
} from './dto/language.dto';

export interface KeyRow {
  key: string;
  base: string;
  reference: string;
  override?: string;
  source: 'base' | 'override';
}

@Injectable()
export class I18nService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  /** Cache of flattened base bundles per language — the JSON never changes at
   *  runtime, so we can build these once per process. */
  private readonly baseCache = new Map<string, Map<string, string>>();

  private baseFlat(language: string): Map<string, string> {
    const cached = this.baseCache.get(language);
    if (cached) return cached;
    const bundle =
      (BASE_STRINGS as Record<string, Record<string, unknown>>)[language] ??
      BASE_STRINGS[DEFAULT_LANGUAGE];
    const flat = flattenBundle(bundle);
    this.baseCache.set(language, flat);
    return flat;
  }

  /** Every key we know about — union across every base bundle so an override
   *  can never reference a key that isn't in the source. */
  private universalKeys(): Set<string> {
    const out = new Set<string>();
    for (const code of Object.keys(BASE_STRINGS)) {
      for (const key of this.baseFlat(code).keys()) out.add(key);
    }
    return out;
  }

  private async assertLanguageExists(code: string): Promise<Language> {
    const row = await this.prisma.language.findUnique({ where: { code } });
    if (!row) throw new NotFoundException(`Language ${code} not found.`);
    return row;
  }

  // ---------- Languages ---------------------------------------------------

  listLanguages(includeInactive = false): Promise<Language[]> {
    return this.prisma.language.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ ordering: 'asc' }, { code: 'asc' }],
    });
  }

  async createLanguage(input: CreateLanguageDto): Promise<Language> {
    try {
      return await this.prisma.language.create({
        data: {
          code: input.code,
          name: input.name.trim(),
          nativeName: input.nativeName.trim(),
          active: input.active ?? true,
          ordering: input.ordering ?? 0,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `A language with code ${input.code} already exists.`,
        );
      }
      throw error;
    }
  }

  async updateLanguage(
    code: string,
    input: UpdateLanguageDto,
  ): Promise<Language> {
    await this.assertLanguageExists(code);
    const data: Prisma.LanguageUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.nativeName !== undefined) data.nativeName = input.nativeName.trim();
    if (input.active !== undefined) data.active = input.active;
    if (input.ordering !== undefined) data.ordering = input.ordering;
    return this.prisma.language.update({ where: { code }, data });
  }

  async removeLanguage(code: string): Promise<Language> {
    if (code === DEFAULT_LANGUAGE) {
      throw new BadRequestException(
        'The default language cannot be removed. Deactivate it instead.',
      );
    }
    await this.assertLanguageExists(code);
    return this.prisma.language.update({
      where: { code },
      data: { active: false },
    });
  }

  // ---------- Overrides + merged bundle -----------------------------------

  /**
   * Merged bundle for a single language, nested for the SPA runtime. Base
   * values first, overrides applied on top. Public — the buyer-facing
   * pages call this at boot.
   */
  async mergedBundle(language: string): Promise<Record<string, unknown>> {
    const flat = new Map(this.baseFlat(language));
    const overrides = await this.prisma.translationOverride.findMany({
      where: { language },
      select: { key: true, value: true },
    });
    for (const o of overrides) flat.set(o.key, o.value);
    return nestBundle(flat);
  }

  /**
   * Per-key snapshot for the admin table. Every known key gets a row, with
   * base + reference + override + source. `missingOnly` narrows to rows
   * where the target-language base is empty AND no override exists — i.e.
   * translations we haven't authored yet.
   */
  async listKeys(
    language: string,
    opts?: { missingOnly?: boolean; search?: string },
  ): Promise<KeyRow[]> {
    await this.assertLanguageExists(language);
    const base = this.baseFlat(language);
    const reference = this.baseFlat(DEFAULT_LANGUAGE);
    const overrides = await this.prisma.translationOverride.findMany({
      where: { language },
      select: { key: true, value: true },
    });
    const overrideMap = new Map(overrides.map((o) => [o.key, o.value]));

    const universal = this.universalKeys();
    const rows: KeyRow[] = [];
    for (const key of universal) {
      const baseValue = base.get(key) ?? '';
      const referenceValue = reference.get(key) ?? '';
      const override = overrideMap.get(key);
      const source: KeyRow['source'] = override !== undefined ? 'override' : 'base';
      rows.push({
        key,
        base: baseValue,
        reference: referenceValue,
        override,
        source,
      });
    }
    rows.sort((a, b) => a.key.localeCompare(b.key));

    let filtered = rows;
    if (opts?.missingOnly) {
      filtered = filtered.filter((r) => !r.base && r.override === undefined);
    }
    const search = opts?.search?.trim().toLowerCase();
    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.key.toLowerCase().includes(search) ||
          r.reference.toLowerCase().includes(search) ||
          r.base.toLowerCase().includes(search) ||
          (r.override ?? '').toLowerCase().includes(search),
      );
    }
    return filtered;
  }

  async upsertOverride(
    language: string,
    key: string,
    value: string,
    actorEmail?: string,
  ): Promise<TranslationOverride> {
    await this.assertLanguageExists(language);
    if (!this.universalKeys().has(key)) {
      throw new BadRequestException(
        `Key "${key}" is not in the base bundle — refusing to create an orphan override.`,
      );
    }
    return this.prisma.translationOverride.upsert({
      where: { language_key: { language, key } },
      create: {
        language,
        key,
        value,
        updatedBy: actorEmail ?? null,
      },
      update: { value, updatedBy: actorEmail ?? null },
    });
  }

  async removeOverride(language: string, key: string): Promise<{ ok: true }> {
    await this.assertLanguageExists(language);
    await this.prisma.translationOverride.deleteMany({
      where: { language, key },
    });
    return { ok: true };
  }

  async bundleVersion(language: string): Promise<string> {
    const latest = await this.prisma.translationOverride.findFirst({
      where: { language },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    return latest?.updatedAt.toISOString() ?? 'base';
  }

  actorEmailFromContext(): string | undefined {
    return this.context.get()?.actorEmail ?? undefined;
  }
}
