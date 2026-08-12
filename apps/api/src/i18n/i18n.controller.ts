import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto';
import { UpsertOverrideDto } from './dto/upsert-override.dto';
import { I18nService } from './i18n.service';

@ApiTags('i18n')
@Controller()
export class I18nController {
  constructor(private readonly i18n: I18nService) {}

  // ---------- Public endpoints (SPA + buyer pages read these) -----------

  @Public()
  @Get('i18n/languages')
  @ApiOperation({
    summary: 'Enabled languages for the SPA switcher + buyer public pages.',
  })
  publicLanguages() {
    return this.i18n.listLanguages(false);
  }

  @Public()
  @Get('i18n/bundle/:lang')
  @ApiOperation({
    summary:
      'Merged translation bundle (base + DB overrides) for one language. ETag-cached so the SPA can revalidate cheaply.',
  })
  @Header('Cache-Control', 'public, max-age=0, must-revalidate')
  async publicBundle(
    @Param('lang') lang: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const version = await this.i18n.bundleVersion(lang);
    res.setHeader('ETag', `W/"${version}"`);
    return this.i18n.mergedBundle(lang);
  }

  // ---------- SUPER_ADMIN management surface ----------------------------

  @Get('admin/i18n/languages')
  @RequirePermissions('translation.manage')
  @ApiOperation({
    summary: 'Every configured language (including inactive) for the admin table.',
  })
  adminLanguages() {
    return this.i18n.listLanguages(true);
  }

  @Post('admin/i18n/languages')
  @RequirePermissions('translation.manage')
  createLanguage(@Body() body: CreateLanguageDto) {
    return this.i18n.createLanguage(body);
  }

  @Patch('admin/i18n/languages/:code')
  @RequirePermissions('translation.manage')
  updateLanguage(
    @Param('code') code: string,
    @Body() body: UpdateLanguageDto,
  ) {
    return this.i18n.updateLanguage(code, body);
  }

  @Delete('admin/i18n/languages/:code')
  @RequirePermissions('translation.manage')
  @ApiOperation({
    summary:
      'Soft-delete a language (sets active=false). The default language is refused.',
  })
  removeLanguage(@Param('code') code: string) {
    return this.i18n.removeLanguage(code);
  }

  @Get('admin/i18n/keys')
  @RequirePermissions('translation.manage')
  @ApiOperation({
    summary:
      'Every known translation key with base / reference / override columns. ?missingOnly=true narrows to untranslated ones.',
  })
  @ApiQuery({ name: 'language', required: true })
  @ApiQuery({ name: 'missingOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  listKeys(
    @Query('language') language: string,
    @Query('missingOnly') missingOnly?: string,
    @Query('search') search?: string,
  ) {
    return this.i18n.listKeys(language, {
      missingOnly: missingOnly === 'true',
      search,
    });
  }

  @Patch('admin/i18n/keys/:language/:key')
  @RequirePermissions('translation.manage')
  @ApiOperation({ summary: 'Upsert a translation override.' })
  upsertOverride(
    @Param('language') language: string,
    @Param('key') key: string,
    @Body() body: UpsertOverrideDto,
  ) {
    return this.i18n.upsertOverride(
      language,
      key,
      body.value,
      this.i18n.actorEmailFromContext(),
    );
  }

  @Delete('admin/i18n/keys/:language/:key')
  @RequirePermissions('translation.manage')
  @ApiOperation({
    summary: 'Remove an override — the effective value reverts to the base.',
  })
  removeOverride(
    @Param('language') language: string,
    @Param('key') key: string,
  ) {
    return this.i18n.removeOverride(language, key);
  }
}
