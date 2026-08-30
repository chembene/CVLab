import { ParserRegistry } from './parser-registry';
import { GreenhouseParser } from './parsers/greenhouse.parser';
import { LeverParser } from './parsers/lever.parser';
import { WorkdayParser } from './parsers/workday.parser';
import { LinkedInParser } from './parsers/linkedin.parser';
import { IndeedParser } from './parsers/indeed.parser';
import { GenericHtmlParser } from './parsers/generic-html.parser';

describe('ParserRegistry', () => {
  const registry = new ParserRegistry(
    new GreenhouseParser(),
    new LeverParser(),
    new WorkdayParser(),
    new LinkedInParser(),
    new IndeedParser(),
    new GenericHtmlParser(),
  );

  it.each([
    ['boards.greenhouse.io', 'greenhouse'],
    ['job-boards.greenhouse.io', 'greenhouse'],
    ['jobs.lever.co', 'lever'],
    ['acme.wd1.myworkdayjobs.com', 'workday'],
    ['www.linkedin.com', 'linkedin'],
    ['www.indeed.com', 'indeed'],
    ['careers.some-random-startup.com', 'generic'],
    ['jobs.smartrecruiters.com', 'generic'],
  ])('selects the %s parser for hostname %s', (hostname, expectedName) => {
    expect(registry.select(hostname).name).toBe(expectedName);
  });

  it('normalizes a leading www. before matching', () => {
    expect(registry.select('www.greenhouse.io').name).toBe('greenhouse');
  });
});
