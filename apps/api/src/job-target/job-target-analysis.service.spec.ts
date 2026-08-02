import { NotImplementedException } from '@nestjs/common';
import { JobTargetAnalysisService } from './job-target-analysis.service';

describe('JobTargetAnalysisService', () => {
  const service = new JobTargetAnalysisService();

  it('extractKeywords throws NotImplementedException', async () => {
    await expect(service.extractKeywords('some job description')).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });

  it('calculateATS throws NotImplementedException', async () => {
    await expect(service.calculateATS('jt-1')).rejects.toBeInstanceOf(NotImplementedException);
  });

  it('generateResumeSuggestions throws NotImplementedException', async () => {
    await expect(service.generateResumeSuggestions('jt-1')).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });

  it('generateCoverLetter throws NotImplementedException', async () => {
    await expect(service.generateCoverLetter('jt-1')).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });
});
