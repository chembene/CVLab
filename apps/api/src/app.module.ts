import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HistoryModule } from './history/history.module';
import { ProfileModule } from './profile/profile.module';
import { MasterResumeModule } from './master-resume/master-resume.module';
import { ResumeSectionsModule } from './resume-sections/resume-sections.module';
import { JobTargetModule } from './job-target/job-target.module';
import { ResumeVariantModule } from './resume-variant/resume-variant.module';
import { ApplicationModule } from './application/application.module';
import { AtsModule } from './ats/ats.module';

@Module({
  imports: [
    AppConfigModule,
    // Global rate-limit foundation per prompts/05-security.md "API Security".
    // Stricter per-route limits now exist on the auth endpoints themselves
    // (see AuthController's @Throttle() overrides) — this is the fallback
    // for every other route.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Lightweight in-process domain-event bus per
    // docs/architecture/system-architecture.md §4 — used by the Resume
    // Engine (Profile/MasterResume/sections) to notify HistoryModule.
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    HealthModule,
    UsersModule,
    AuthModule,
    HistoryModule,
    ProfileModule,
    MasterResumeModule,
    ResumeSectionsModule,
    JobTargetModule,
    ResumeVariantModule,
    ApplicationModule,
    AtsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
