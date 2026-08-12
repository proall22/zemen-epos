import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { PermissionsGuard } from './permissions.guard';
import { RefreshTokensService } from './refresh-tokens.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // Pin the algorithm on both sides. Without this, jsonwebtoken accepts
        // anything in the `alg` header — historically including `none` —
        // which is a known class of JWT-confusion bugs. We only ever sign
        // with the HS256 default, so accept only HS256 on verify too.
        signOptions: { algorithm: 'HS256' },
        verifyOptions: {
          algorithms: ['HS256'],
          // Small clock-skew tolerance so a sub-second clock drift between
          // the issuer and verifier never trips a freshly-issued token.
          clockTolerance: 5,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    RefreshTokensService,
    // Order matters — Nest applies APP_GUARDs in registration order.
    // JwtAuthGuard sets `request.user`; PermissionsGuard reads it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, RefreshTokensService],
})
export class AuthModule {}
