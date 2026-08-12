import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { IpFilterMiddleware } from './ip-filter.middleware';

@Module({
  providers: [IpFilterMiddleware],
})
export class IpFilterModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(IpFilterMiddleware).forRoutes('*');
  }
}
