import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MasterResumeModule } from '../master-resume/master-resume.module';
import { ResumeCompletionModule } from '../resume-completion/resume-completion.module';
import { ResumeSectionsRepository } from './resume-sections.repository';
import { ResumeSectionsService } from './resume-sections.service';
import { WorkExperienceController } from './controllers/work-experience.controller';
import { EducationController } from './controllers/education.controller';
import { SkillController } from './controllers/skill.controller';
import { LanguageController } from './controllers/language.controller';
import { CertificateController } from './controllers/certificate.controller';
import { ProjectController } from './controllers/project.controller';
import { CourseController } from './controllers/course.controller';
import { AwardController } from './controllers/award.controller';
import { PublicationController } from './controllers/publication.controller';
import { VolunteerExperienceController } from './controllers/volunteer-experience.controller';
import { ReferenceController } from './controllers/reference.controller';

@Module({
  // AuthModule is imported for JwtAuthGuard (used via @UseGuards on every
  // section controller), which itself depends on TokenService.
  imports: [AuthModule, MasterResumeModule, ResumeCompletionModule],
  controllers: [
    WorkExperienceController,
    EducationController,
    SkillController,
    LanguageController,
    CertificateController,
    ProjectController,
    CourseController,
    AwardController,
    PublicationController,
    VolunteerExperienceController,
    ReferenceController,
  ],
  providers: [ResumeSectionsRepository, ResumeSectionsService],
  // ResumeSectionsRepository is exported so ResumeVariantModule (Phase 3)
  // can read all 11 live section types when building a Resume Variant's
  // content snapshot — it needs raw section data, not the section-mutation
  // business logic in ResumeSectionsService.
  exports: [ResumeSectionsRepository],
})
export class ResumeSectionsModule {}
