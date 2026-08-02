import { ResumeSectionsRepository } from './resume-sections.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('ResumeSectionsRepository', () => {
  function buildPrismaMock() {
    const delegateMethods = {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    };
    const prisma = {
      workExperience: delegateMethods,
      skill: delegateMethods,
    } as unknown as jest.Mocked<PrismaService>;
    return { prisma, delegateMethods };
  }

  it('converts configured date fields (e.g. startDate/endDate) to real Date instances on create', async () => {
    const { prisma, delegateMethods } = buildPrismaMock();
    const repository = new ResumeSectionsRepository(prisma);

    await repository.create('work-experience', 'resume-1', {
      company: 'Acme',
      startDate: '2020-01-01',
      endDate: '2021-06-15',
    });

    const callArg = delegateMethods.create.mock.calls[0][0];
    expect(callArg.data.startDate).toBeInstanceOf(Date);
    expect(callArg.data.endDate).toBeInstanceOf(Date);
    expect(callArg.data.startDate.toISOString()).toContain('2020-01-01');
    expect(callArg.data.company).toBe('Acme');
  });

  it('converts date fields on update too', async () => {
    const { prisma, delegateMethods } = buildPrismaMock();
    const repository = new ResumeSectionsRepository(prisma);

    await repository.update('work-experience', 'we-1', { endDate: '2022-03-01' });

    const callArg = delegateMethods.update.mock.calls[0][0];
    expect(callArg.data.endDate).toBeInstanceOf(Date);
  });

  it('leaves data untouched for section types with no configured date fields', async () => {
    const { prisma, delegateMethods } = buildPrismaMock();
    const repository = new ResumeSectionsRepository(prisma);

    await repository.create('skills', 'resume-1', { name: 'TypeScript' });

    const callArg = delegateMethods.create.mock.calls[0][0];
    expect(callArg.data.name).toBe('TypeScript');
  });

  it('does not choke when a date field is already absent/undefined', async () => {
    const { prisma, delegateMethods } = buildPrismaMock();
    const repository = new ResumeSectionsRepository(prisma);

    await repository.create('work-experience', 'resume-1', {
      company: 'Acme',
      startDate: '2020-01-01',
    });

    const callArg = delegateMethods.create.mock.calls[0][0];
    expect(callArg.data.endDate).toBeUndefined();
  });
});
