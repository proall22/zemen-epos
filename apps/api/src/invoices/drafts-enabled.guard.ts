import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Hides the offline-draft routes while the feature is parked. A guard rather
 * than a service check because guards run before the validation pipe — a
 * parked route should 404 on any body, not 400 on a malformed one.
 */
@Injectable()
export class DraftsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('DRAFTS_ENABLED') !== 'true') {
      throw new NotFoundException('Offline drafts are not enabled.');
    }
    return true;
  }
}
