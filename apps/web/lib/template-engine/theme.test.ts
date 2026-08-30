import { resolveTheme, LAYOUT_DEFAULTS } from './theme';
import type { TemplateMetadata } from '@/lib/api/templates';

function makeTemplate(overrides: Partial<TemplateMetadata> = {}): TemplateMetadata {
  return {
    id: 'ats-classic',
    name: 'ATS Classic',
    category: 'ATS_CLASSIC',
    previewImage: null,
    thumbnail: null,
    isATSFriendly: true,
    premium: false,
    version: 1,
    primaryColor: '#111827',
    secondaryColor: '#374151',
    font: 'Arial',
    layout: 'single-column',
    supportedSections: ['summary', 'workExperiences'],
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('resolveTheme', () => {
  it('falls back to layout defaults + template fields when no overrides are given', () => {
    const template = makeTemplate();
    const theme = resolveTheme(template, undefined);

    expect(theme.typography.fontFamily).toBe('Arial'); // template.font wins over BASE_TYPOGRAPHY default
    expect(theme.colors.primary).toBe('#111827');
    expect(theme.colors.secondary).toBe('#374151');
    expect(theme.colors.accent).toBe('#374151'); // derived from secondary when no accent override
    expect(theme.header.style).toBe(LAYOUT_DEFAULTS['single-column']!.header.style);
    expect(theme.iconsEnabled).toBe(LAYOUT_DEFAULTS['single-column']!.layout.supportsIcons);
  });

  it('falls back to the single-column layout for an unknown layout key', () => {
    const template = makeTemplate({ layout: 'does-not-exist' });
    const theme = resolveTheme(template, undefined);
    expect(theme.layout.key).toBe('single-column');
  });

  it('lets user overrides win over both the layout defaults and the template fields', () => {
    const template = makeTemplate({ layout: 'sidebar-left' }); // header.style defaults to 'sidebar'
    const theme = resolveTheme(template, {
      primaryColor: '#FF0000',
      secondaryColor: '#00FF00',
      fontFamily: 'Georgia',
      headerStyle: 'centered',
      iconsEnabled: false,
    });

    expect(theme.colors.primary).toBe('#FF0000');
    expect(theme.colors.secondary).toBe('#00FF00');
    expect(theme.typography.fontFamily).toBe('Georgia');
    expect(theme.header.style).toBe('centered'); // overrides the sidebar-left default of 'sidebar'
    expect(theme.iconsEnabled).toBe(false); // overrides the sidebar-left default of true
  });

  it('lets an explicit accentColor override win over the derived-from-secondary default', () => {
    const template = makeTemplate();
    const theme = resolveTheme(template, { secondaryColor: '#00FF00', accentColor: '#123456' });
    expect(theme.colors.accent).toBe('#123456');
  });

  it('converts lineHeightPercent (a whole-number UI value) into a CSS line-height ratio', () => {
    const template = makeTemplate();
    const theme = resolveTheme(template, { lineHeightPercent: 200 });
    expect(theme.typography.lineHeight).toBe(2);
  });

  it('applies a null overrides object the same as undefined', () => {
    const template = makeTemplate();
    expect(resolveTheme(template, null)).toEqual(resolveTheme(template, undefined));
  });

  it('picks up layout-specific spacing overrides (e.g. header-band is spacious by default)', () => {
    const template = makeTemplate({ layout: 'header-band' });
    const theme = resolveTheme(template, undefined);
    expect(theme.spacing.sectionGap).toBe('spacious');
  });
});
