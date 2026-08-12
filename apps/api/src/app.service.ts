import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /** Public root marker — intentionally generic and version-free. Real
   *  monitoring endpoints live at /healthz (readiness) and /livez
   *  (liveness); see HealthController. */
  getHello(): string {
    return 'ok';
  }
}
