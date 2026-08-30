/**
 * A real, live-rendered miniature of a template's layout + colors — not a
 * placeholder image link. No design-asset pipeline exists yet (`thumbnail`/
 * `previewImage` are deliberately left null in the seed data — see
 * docs/architecture/template-engine.md §4), so the gallery card's preview
 * is generated directly from the same `layout`/`primaryColor`/
 * `secondaryColor` fields the real renderer reads.
 */
export function TemplateSwatch({
  layout,
  primaryColor,
  secondaryColor,
}: {
  layout: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  const hasSidebar = layout.includes('sidebar') || layout === 'two-column-photo';
  const isBand = layout.includes('header-band');
  const isLetter = layout.startsWith('letter-');
  const sidebarLeft = layout !== 'sidebar-right';

  const lines = (x: number, y: number, w: number, count: number, color: string) =>
    Array.from({ length: count }, (_, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <rect
        key={i}
        x={x}
        y={y + i * 7}
        width={w - (i % 3 === 2 ? w * 0.4 : 0)}
        height={2.5}
        rx={1.25}
        fill={color}
        opacity={0.7}
      />
    ));

  const sidebarBlock = hasSidebar && (
    <rect
      x={sidebarLeft ? 4 : 68}
      y={isBand ? 26 : 4}
      width={24}
      height={isBand ? 66 : 88}
      rx={2}
      fill={`${primaryColor}22`}
    />
  );

  return (
    <svg
      viewBox="0 0 96 96"
      className="h-full w-full"
      role="img"
      aria-label={`Pré-visualização do esquema ${layout}`}
    >
      <rect x={0} y={0} width={96} height={96} rx={4} fill="#FFFFFF" stroke="#E5E7EB" />
      {isBand ? (
        <rect x={0} y={0} width={96} height={22} rx={4} fill={primaryColor} />
      ) : (
        <>
          <circle cx={12} cy={12} r={6} fill={primaryColor} opacity={isLetter ? 0.6 : 1} />
          <rect x={22} y={8} width={40} height={3} rx={1.5} fill={primaryColor} />
          <rect x={22} y={14} width={26} height={2} rx={1} fill={secondaryColor} opacity={0.7} />
        </>
      )}
      {sidebarBlock}
      <g>
        {lines(
          sidebarLeft && hasSidebar ? 32 : 4,
          isBand ? 30 : 26,
          sidebarLeft && hasSidebar ? 60 : hasSidebar ? 60 : 88,
          isLetter ? 5 : 8,
          secondaryColor,
        )}
      </g>
    </svg>
  );
}
