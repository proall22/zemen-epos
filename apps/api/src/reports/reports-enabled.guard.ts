import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A guard, not a service check: guards run before the validation pipe, so a
 *  parked route 404s on any body rather than 400ing on a malformed one. */
@Injectable()
export class ReportsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('REPORTS_ENABLED') !== 'true') {
      throw new NotFoundException('Scheduled reports are not enabled.');
    }
    return true;
  }
}
