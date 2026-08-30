import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InterviewDifficulty, InterviewMode, InterviewType } from '@prisma/client';
import { StartInterviewDto } from './start-interview.dto';

/**
 * Only shape-level rules belong to the DTO (type, presence-when-optional,
 * length/range) — see the class's own doc comment. Mode-conditional
 * requiredness ("resumeVariantId required for RESUME", "JOB needs
 * jobTargetId or jobDescription", "role required for ROLE", and every
 * field-must-be-absent-for-this-mode rule) is enforced in
 * InterviewService.start() and covered by interview.service.spec.ts, not
 * here — tests below that exercise a mode/field combination the service
 * would reject are explicitly marked as such.
 */
describe('StartInterviewDto', () => {
  const base = {
    type: InterviewType.MIXED,
    difficulty: InterviewDifficulty.MID,
    language: 'pt-MZ',
  };

  async function validateDto(payload: Record<string, unknown>) {
    const instance = plainToInstance(StartInterviewDto, payload);
    return validate(instance);
  }

  describe('mode RESUME', () => {
    it('is shape-valid with a resumeVariantId', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.RESUME,
        resumeVariantId: 'rv-1',
      });
      expect(errors).toHaveLength(0);
    });

    it('is shape-valid without a resumeVariantId (the service, not the DTO, rejects this for RESUME)', async () => {
      const errors = await validateDto({ ...base, mode: InterviewMode.RESUME });
      expect(errors).toHaveLength(0);
    });
  });

  describe('mode JOB', () => {
    it('is shape-valid with only a jobTargetId', async () => {
      const errors = await validateDto({ ...base, mode: InterviewMode.JOB, jobTargetId: 'jt-1' });
      expect(errors).toHaveLength(0);
    });

    it('is shape-valid with only a jobDescription', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.JOB,
        jobDescription: 'We are hiring a backend engineer.',
      });
      expect(errors).toHaveLength(0);
    });

    it('is shape-valid with both jobTargetId and jobDescription', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.JOB,
        jobTargetId: 'jt-1',
        jobDescription: 'Additional context pasted by the user.',
      });
      expect(errors).toHaveLength(0);
    });

    it('is shape-valid with neither jobTargetId nor jobDescription (the service rejects this)', async () => {
      const errors = await validateDto({ ...base, mode: InterviewMode.JOB });
      expect(errors).toHaveLength(0);
    });

    it('is shape-valid with an optional resumeVariantId alongside a jobTargetId', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.JOB,
        jobTargetId: 'jt-1',
        resumeVariantId: 'rv-1',
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('mode ROLE', () => {
    it('is shape-valid with a role', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.ROLE,
        role: 'Backend Developer',
      });
      expect(errors).toHaveLength(0);
    });

    it('is shape-valid without a role (the service, not the DTO, requires it for ROLE)', async () => {
      const errors = await validateDto({ ...base, mode: InterviewMode.ROLE });
      expect(errors).toHaveLength(0);
    });

    it('is shape-valid with all optional fields', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.ROLE,
        role: 'Backend Developer',
        industry: 'Fintech',
        yearsExperience: 5,
        companyName: 'Acme',
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('invalid fields', () => {
    it('rejects an invalid mode', async () => {
      const errors = await validateDto({ ...base, mode: 'NOT_A_MODE' });
      expect(errors.some((e) => e.property === 'mode')).toBe(true);
    });

    it('rejects a blank resumeVariantId/jobTargetId/role when provided as an empty string', async () => {
      const errors = await validateDto({ ...base, mode: InterviewMode.ROLE, role: '' });
      expect(errors.some((e) => e.property === 'role')).toBe(true);
    });

    it('rejects yearsExperience below 0', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.ROLE,
        role: 'X',
        yearsExperience: -1,
      });
      expect(errors.some((e) => e.property === 'yearsExperience')).toBe(true);
    });

    it('rejects yearsExperience above 60', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.ROLE,
        role: 'X',
        yearsExperience: 61,
      });
      expect(errors.some((e) => e.property === 'yearsExperience')).toBe(true);
    });

    it('rejects a non-numeric yearsExperience', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.ROLE,
        role: 'X',
        yearsExperience: 'abc',
      });
      expect(errors.some((e) => e.property === 'yearsExperience')).toBe(true);
    });
  });

  describe('size limits', () => {
    it('rejects a jobDescription over 8000 characters', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.JOB,
        jobDescription: 'x'.repeat(8001),
      });
      expect(errors.some((e) => e.property === 'jobDescription')).toBe(true);
    });

    it('accepts a jobDescription at exactly 8000 characters', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.JOB,
        jobDescription: 'x'.repeat(8000),
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects a role over 200 characters', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.ROLE,
        role: 'x'.repeat(201),
      });
      expect(errors.some((e) => e.property === 'role')).toBe(true);
    });

    it('rejects an industry over 200 characters', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.ROLE,
        role: 'X',
        industry: 'x'.repeat(201),
      });
      expect(errors.some((e) => e.property === 'industry')).toBe(true);
    });

    it('rejects a companyName over 200 characters', async () => {
      const errors = await validateDto({
        ...base,
        mode: InterviewMode.ROLE,
        role: 'X',
        companyName: 'x'.repeat(201),
      });
      expect(errors.some((e) => e.property === 'companyName')).toBe(true);
    });
  });
});
