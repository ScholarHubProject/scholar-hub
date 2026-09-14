import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { colors, mutedTextStyle } from "../sharedStyles";
import {
  SERIES_COLORS,
  buildTicks,
  formatCompact,
  formatNumber,
  formatPercent,
  niceCeiling,
  toneColor,
} from "./vizTokens";

// ---------------------------------------------------------------
// Chart kit
// ---------------------------------------------------------------
// Hand-rolled SVG rather than a charting library. Three reasons it is
// worth the extra file: every mark reads its colour from the same CSS
// custom properties as the rest of the app, so the dark-mode switch
// needs no chart-specific code; the bundle stays free of a 100 KB
// dependency on a project that ships as a serverless function; and the
// accessibility rules below (legend always present, a table view behind
// every chart, values never carried by colour alone) can be enforced in
// one place instead of per call site.
//
// The palette, the status tones and the number formatters live in
// ./vizTokens.js.

// ---------------------------------------------------------------
// Layout
// ---------------------------------------------------------------
// Charts are drawn at their real pixel width so labels stay the same
// size on a phone and on a desktop, instead of being scaled up and down
// with a viewBox. Without a viewBox an SVG wider than its box is clipped
// rather than scaled, so measuring correctly is not cosmetic: get it
// wrong and the last bar and its label silently disappear.
//
// The measured node is held in state rather than in a ref because a
// chart usually mounts empty and only grows a plot once its data
// arrives. A ref-based effect with an empty dependency list runs once,
// while the element is still the empty-state placeholder, and never
// again - leaving every chart stuck at the fallback width.
const useChartWidth = (fallback = 640) => {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    if (!node) return undefined;

    const measure = () => setWidth(Math.max(240, Math.round(node.clientWidth)));

    if (typeof ResizeObserver === "undefined") {
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    // ResizeObserver delivers an observation as soon as it is attached,
    // which covers the initial measurement too.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, width];
};

// Category labels are dropped rather than allowed to overlap: an axis of
// twelve months on a narrow card can only carry four or five of them.
// The first and last are always kept so the range is still readable.
const visibleLabelIndexes = (count, plotWidth, minGap = 62) => {
  if (count <= 1) return [0];

  const step = Math.max(1, Math.ceil((count * minGap) / Math.max(plotWidth, 1)));
  const shown = [];

  for (let index = 0; index < count; index += step) {
    shown.push(index);
  }

  const last = count - 1;
  if (shown[shown.length - 1] !== last) {
    // Drop the previous label if the final one would land on top of it.
    if (last - shown[shown.length - 1] < step / 2) shown.pop();
    shown.push(last);
  }

  return shown;
};

// Bars grow from the baseline, so only the data end is rounded. A fully
// rounded rect would lift the bar off its own axis.
const barPath = (x, y, width, height, radius = 4) => {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (height <= 0) return "";
  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    "Z",
  ].join(" ");
};

const barPathHorizontal = (x, y, width, height, radius = 4) => {
  const r = Math.max(0, Math.min(radius, height / 2, width));
  if (width <= 0) return "";
  return [
    `M${x},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height - r}`,
    `Q${x + width},${y + height} ${x + width - r},${y + height}`,
    `L${x},${y + height}`,
    "Z",
  ].join(" ");
};

const polarPoint = (cx, cy, radius, angleDeg) => {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
};

const donutSegmentPath = (cx, cy, outer, inner, startAngle, endAngle) => {
  const sweep = endAngle - startAngle;
  if (sweep <= 0.01) return "";
  const largeArc = sweep > 180 ? 1 : 0;
  const [ox1, oy1] = polarPoint(cx, cy, outer, startAngle);
  const [ox2, oy2] = polarPoint(cx, cy, outer, endAngle);
  const [ix1, iy1] = polarPoint(cx, cy, inner, endAngle);
  const [ix2, iy2] = polarPoint(cx, cy, inner, startAngle);
  return [
    `M${ox1},${oy1}`,
    `A${outer},${outer} 0 ${largeArc} 1 ${ox2},${oy2}`,
    `L${ix1},${iy1}`,
    `A${inner},${inner} 0 ${largeArc} 0 ${ix2},${iy2}`,
    "Z",
  ].join(" ");
};

// Long program names would otherwise collide on a category axis.
const truncate = (value, max) => {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// ---------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------
const Tooltip = ({ point }) => {
  if (!point) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: point.x,
        top: point.y,
        transform: "translate(-50%, -115%)",
        background: "var(--viz-tooltip-bg)",
        color: "var(--viz-tooltip-ink)",
        borderRadius: "10px",
        padding: "9px 11px",
        fontSize: "12px",
        lineHeight: 1.5,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.28)",
        zIndex: 5,
      }}
      role="status"
    >
      <strong style={{ display: "block", fontSize: "12px", marginBottom: point.rows?.length ? "5px" : 0 }}>
        {point.title}
      </strong>
      {point.rows?.map((row) => (
        <span key={row.label} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          {row.color && (
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "2px",
                background: row.color,
                flex: "0 0 auto",
              }}
            />
          )}
          <span style={{ opacity: 0.82 }}>{row.label}</span>
          <strong style={{ marginLeft: "auto" }}>{row.value}</strong>
        </span>
      ))}
    </div>
  );
};

export const Legend = ({ items, style }) => {
  if (!items?.length) return null;

  return (
    <ul style={{ ...legendListStyle, ...style }}>
      {items.map((item) => (
        <li key={item.label} style={legendItemStyle}>
          <span
            aria-hidden="true"
            style={{
              width: item.shape === "line" ? "14px" : "10px",
              height: item.shape === "line" ? "3px" : "10px",
              borderRadius: item.shape === "line" ? "2px" : "3px",
              background: item.color,
              flex: "0 0 auto",
            }}
          />
          <span>{item.label}</span>
          {item.value != null && <strong style={legendValueStyle}>{item.value}</strong>}
        </li>
      ))}
    </ul>
  );
};

export const DataTable = ({ columns, rows, caption }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={vizTableStyle} className="viz-table">
      {caption && <caption style={tableCaptionStyle}>{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th
              key={column}
              scope="col"
              style={{ ...vizThStyle, textAlign: index === 0 ? "left" : "right" }}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`${row[0]}-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              <td
                key={`${rowIndex}-${cellIndex}`}
                style={{ ...vizTdStyle, textAlign: cellIndex === 0 ? "left" : "right" }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Every chart ships with the same twin: a table of the exact numbers.
// The tooltip enhances the chart, it never gates a value.
export const ChartCard = ({
  title,
  subtitle,
  legend,
  footnote,
  table,
  actions,
  children,
  stale,
}) => {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();

  return (
    <section style={chartCardStyle} className="sh-print-block" aria-labelledby={headingId}>
      <header style={chartHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <h3 id={headingId} style={chartTitleStyle}>
            {title}
          </h3>
          {subtitle && <p style={chartSubtitleStyle}>{subtitle}</p>}
        </div>
        <div style={chartActionsStyle} className="sh-no-print">
          {actions}
          {table && (
            <button
              type="button"
              style={ghostButtonStyle}
              onClick={() => setShowTable((value) => !value)}
              aria-expanded={showTable}
            >
              {showTable ? "View chart" : "View data"}
            </button>
          )}
        </div>
      </header>

      {legend?.length > 0 && <Legend items={legend} />}

      <div className={stale ? "viz-stale" : undefined}>
        {showTable && table ? (
          <DataTable columns={table.columns} rows={table.rows} caption={table.caption} />
        ) : (
          children
        )}
      </div>

      {footnote && <p style={chartFootnoteStyle}>{footnote}</p>}
    </section>
  );
};

export const EmptyPlot = ({ message = "No data for this filter yet.", height = 220 }) => (
  <div style={{ ...emptyPlotStyle, height }}>
    <span aria-hidden="true" style={{ fontSize: "22px", opacity: 0.5 }}>▦</span>
    <p style={{ ...mutedTextStyle, fontSize: "13px", textAlign: "center" }}>{message}</p>
  </div>
);

// ---------------------------------------------------------------
// Column chart - compare magnitude across categories
// ---------------------------------------------------------------
export const ColumnChart = ({
  data,
  height = 260,
  color = SERIES_COLORS[0],
  valueFormat = formatNumber,
  labelChars = 12,
  axisLabel,
  ariaLabel,
}) => {
  const [ref, width] = useChartWidth();
  const [hover, setHover] = useState(null);

  const points = data || [];
  const maxValue = Math.max(...points.map((point) => Number(point.value) || 0), 0);
  const ticks = buildTicks(maxValue);
  const top = ticks[ticks.length - 1] || 1;

  const padding = { top: 18, right: 12, bottom: 46, left: 46 };
  const plotWidth = Math.max(10, width - padding.left - padding.right);
  const plotHeight = Math.max(10, height - padding.top - padding.bottom);
  const band = points.length ? plotWidth / points.length : plotWidth;
  // Cap the bar and let the leftover band be air - a bar that fills its
  // slot reads as a solid block rather than a measurement.
  const barWidth = Math.min(24, Math.max(6, band - 14));
  // Shorten the label to the width of its own band before considering
  // dropping any: on a category axis a missing label leaves a bar the
  // reader cannot identify, which is worse than an abbreviation.
  const fittedChars = Math.max(4, Math.floor((band - 6) / 6.2));
  const labelLength = Math.min(labelChars, fittedChars);
  const shownLabels = new Set(visibleLabelIndexes(points.length, plotWidth, Math.max(26, band)));

  if (!points.length) return <EmptyPlot height={height} />;

  return (
    <div ref={ref} style={plotWrapStyle}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel || `Column chart. ${points.map((p) => `${p.label}: ${valueFormat(p.value)}`).join(", ")}`}
        className="viz-plot"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - (tick / top) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="var(--viz-grid)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="viz-tick"
                style={tickTextStyle}
              >
                {formatCompact(tick)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const value = Number(point.value) || 0;
          const barHeight = top ? (value / top) * plotHeight : 0;
          const x = padding.left + band * index + (band - barWidth) / 2;
          const y = padding.top + plotHeight - barHeight;
          const isActive = hover?.index === index;

          return (
            <g key={`${point.label}-${index}`}>
              <path
                d={barPath(x, y, barWidth, barHeight)}
                fill={point.color || color}
                className={`viz-mark viz-grow${isActive ? " is-active" : ""}`}
                style={{ animationDelay: `${index * 35}ms` }}
              />
              {/* The hit area covers the whole band, so a 6px bar is
                  still easy to hover on a laptop trackpad. */}
              <rect
                x={padding.left + band * index}
                y={padding.top}
                width={band}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() =>
                  setHover({
                    index,
                    x: padding.left + band * index + band / 2,
                    y,
                    title: point.label,
                    rows: [
                      {
                        label: point.tooltipLabel || axisLabel || "Applicants",
                        value: valueFormat(value),
                        color: point.color || color,
                      },
                    ],
                  })
                }
              />
              {shownLabels.has(index) && (
                <text
                  x={padding.left + band * index + band / 2}
                  y={height - padding.bottom + 18}
                  textAnchor="middle"
                  style={axisTextStyle}
                >
                  {truncate(point.label, labelLength)}
                </text>
              )}
              {shownLabels.has(index) && point.sublabel && (
                <text
                  x={padding.left + band * index + band / 2}
                  y={height - padding.bottom + 32}
                  textAnchor="middle"
                  style={{ ...axisTextStyle, fontSize: "10px", opacity: 0.75 }}
                >
                  {truncate(point.sublabel, labelLength + 2)}
                </text>
              )}
            </g>
          );
        })}

        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + plotHeight}
          y2={padding.top + plotHeight}
          stroke="var(--viz-axis)"
          strokeWidth="1"
        />
      </svg>
      <Tooltip point={hover} />
    </div>
  );
};

// ---------------------------------------------------------------
// Horizontal bars - the right form when category names are long
// ---------------------------------------------------------------
export const BarListChart = ({
  data,
  color = SERIES_COLORS[0],
  valueFormat = formatNumber,
  maxRows = 8,
  ariaLabel,
}) => {
  const rows = (data || []).slice(0, maxRows);
  const maxValue = Math.max(...rows.map((row) => Number(row.value) || 0), 1);
  const [ref, width] = useChartWidth();
  const [hover, setHover] = useState(null);

  if (!rows.length) return <EmptyPlot height={200} />;

  const labelWidth = Math.min(190, Math.max(110, Math.round(width * 0.32)));
  const valueWidth = 56;
  const rowHeight = 34;
  const barHeight = 16;
  const trackWidth = Math.max(20, width - labelWidth - valueWidth - 12);
  const height = rows.length * rowHeight + 8;

  return (
    <div ref={ref} style={plotWrapStyle}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel || `Bar chart. ${rows.map((r) => `${r.label}: ${valueFormat(r.value)}`).join(", ")}`}
        className="viz-plot"
        onMouseLeave={() => setHover(null)}
      >
        {rows.map((row, index) => {
          const value = Number(row.value) || 0;
          const barWidth = (value / maxValue) * trackWidth;
          const y = index * rowHeight + 6;
          const isActive = hover?.index === index;

          return (
            <g key={`${row.label}-${index}`}>
              <text x={0} y={y + barHeight - 2} style={axisTextStyle}>
                {truncate(row.label, Math.floor(labelWidth / 7))}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={trackWidth}
                height={barHeight}
                rx="4"
                fill="var(--viz-track)"
              />
              <path
                d={barPathHorizontal(labelWidth, y, barWidth, barHeight)}
                fill={row.color || color}
                className={`viz-mark${isActive ? " is-active" : ""}`}
              />
              {/* Direct value labels are the relief for the light-mode
                  slots that sit under 3:1 on white. */}
              <text
                x={width}
                y={y + barHeight - 2}
                textAnchor="end"
                className="viz-tick"
                style={valueTextStyle}
              >
                {valueFormat(value)}
              </text>
              <rect
                x={0}
                y={y - 6}
                width={width}
                height={rowHeight}
                fill="transparent"
                onMouseEnter={() =>
                  setHover({
                    index,
                    x: labelWidth + Math.max(barWidth, 40),
                    y,
                    title: row.label,
                    rows: [
                      {
                        label: row.tooltipLabel || "Count",
                        value: valueFormat(value),
                        color: row.color || color,
                      },
                      ...(row.extra || []),
                    ],
                  })
                }
              />
            </g>
          );
        })}
      </svg>
      <Tooltip point={hover} />
    </div>
  );
};

// ---------------------------------------------------------------
// Line chart - trend over time, one or more series
// ---------------------------------------------------------------
export const LineChart = ({
  series,
  xLabels,
  height = 280,
  valueFormat = formatNumber,
  yDomain,
  yInverted = false,
  referenceLine,
  ariaLabel,
  showArea = true,
}) => {
  const [ref, width] = useChartWidth();
  const [hoverIndex, setHoverIndex] = useState(null);
  const lines = series || [];
  const labels = xLabels || [];

  const flatValues = lines.flatMap((line) => line.values.filter((value) => value != null));
  const rawMax = Math.max(...flatValues, 0);
  const rawMin = Math.min(...flatValues, 0);

  const domain = yDomain || [0, niceCeiling(rawMax || 1)];
  const [domainMin, domainMax] = domain;
  const span = domainMax - domainMin || 1;

  const padding = { top: 20, right: 18, bottom: 40, left: 46 };
  const plotWidth = Math.max(10, width - padding.left - padding.right);
  const plotHeight = Math.max(10, height - padding.top - padding.bottom);
  const stepX = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;

  const toY = useCallback(
    (value) => {
      const ratio = (value - domainMin) / span;
      const normalized = yInverted ? ratio : 1 - ratio;
      return padding.top + normalized * plotHeight;
    },
    [domainMin, span, yInverted, padding.top, plotHeight]
  );

  const toX = (index) => padding.left + stepX * index;
  const ticks = useMemo(
    () => Array.from({ length: 5 }, (_, index) => domainMin + (span / 4) * index),
    [domainMin, span]
  );

  const shownLabelIndexes = visibleLabelIndexes(labels.length, plotWidth);
  // Truncate to the room each surviving label actually has rather than to
  // a fixed count, so four terms on a wide card keep their year.
  // 12px of the slot is left as breathing room, so two neighbouring
  // labels keep a visible gap instead of touching.
  const labelLength = Math.max(
    6,
    Math.floor((plotWidth / Math.max(shownLabelIndexes.length, 1) - 12) / 6.4)
  );

  if (!labels.length || !lines.length) return <EmptyPlot height={height} />;
  if (rawMin === 0 && rawMax === 0 && flatValues.length === 0) return <EmptyPlot height={height} />;

  return (
    <div ref={ref} style={plotWrapStyle}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={
          ariaLabel ||
          `Line chart over ${labels.join(", ")}. ${lines
            .map((line) => `${line.label}: ${line.values.map(valueFormat).join(", ")}`)
            .join(". ")}`
        }
        onMouseLeave={() => setHoverIndex(null)}
      >
        {ticks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="var(--viz-grid)"
                strokeWidth="1"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="viz-tick" style={tickTextStyle}>
                {valueFormat(tick)}
              </text>
            </g>
          );
        })}

        {referenceLine != null && (
          <g>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={toY(referenceLine.value)}
              y2={toY(referenceLine.value)}
              stroke="var(--viz-critical)"
              strokeWidth="1.5"
              opacity="0.7"
            />
            {/* Anchored left. The right edge belongs to the series
                end-label, and two labels on the same baseline collide. */}
            <text
              x={padding.left + 6}
              y={toY(referenceLine.value) - 6}
              textAnchor="start"
              style={{ ...axisTextStyle, fill: "var(--viz-critical)", fontWeight: 700 }}
            >
              {referenceLine.label}
            </text>
          </g>
        )}

        {hoverIndex != null && (
          <line
            x1={toX(hoverIndex)}
            x2={toX(hoverIndex)}
            y1={padding.top}
            y2={padding.top + plotHeight}
            stroke="var(--viz-axis)"
            strokeWidth="1"
          />
        )}

        {lines.map((line, lineIndex) => {
          const color = line.color || SERIES_COLORS[lineIndex % SERIES_COLORS.length];
          const definedPoints = line.values
            .map((value, index) => (value == null ? null : [toX(index), toY(value)]))
            .filter(Boolean);

          if (!definedPoints.length) return null;

          const path = definedPoints
            .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`)
            .join(" ");
          const areaPath = `${path} L${definedPoints[definedPoints.length - 1][0]},${
            padding.top + plotHeight
          } L${definedPoints[0][0]},${padding.top + plotHeight} Z`;

          return (
            <g key={line.label}>
              {showArea && lines.length === 1 && (
                <path d={areaPath} fill={color} opacity="0.1" />
              )}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="viz-draw"
                style={{
                  strokeDasharray: 2000,
                  "--viz-draw-length": 2000,
                }}
              />
              {definedPoints.map(([x, y], index) => (
                <circle
                  key={`${line.label}-${index}`}
                  cx={x}
                  cy={y}
                  r={hoverIndex === index ? 5.5 : 4}
                  fill={color}
                  stroke="var(--viz-surface)"
                  strokeWidth="2"
                />
              ))}
              {/* Only the endpoint is labelled, and only when there is
                  a single line. Two series that meet at the right edge
                  produce two labels on top of each other; the legend and
                  the tooltip carry those instead. */}
              {line.labelEnd !== false && lines.length === 1 && (
                <text
                  x={definedPoints[definedPoints.length - 1][0]}
                  y={definedPoints[definedPoints.length - 1][1] - 12}
                  textAnchor="end"
                  style={valueTextStyle}
                >
                  {valueFormat(line.values.filter((value) => value != null).slice(-1)[0])}
                </text>
              )}
            </g>
          );
        })}

        {shownLabelIndexes.map((index) => (
          <text
            key={`${labels[index]}-${index}`}
            x={toX(index)}
            y={height - padding.bottom + 20}
            textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}
            style={axisTextStyle}
          >
            {truncate(labels[index], labelLength)}
          </text>
        ))}

        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + plotHeight}
          y2={padding.top + plotHeight}
          stroke="var(--viz-axis)"
          strokeWidth="1"
        />

        {labels.map((label, index) => (
          <rect
            key={`hit-${label}-${index}`}
            x={toX(index) - (stepX || plotWidth) / 2}
            y={padding.top}
            width={stepX || plotWidth}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(index)}
          />
        ))}
      </svg>

      <Tooltip
        point={
          hoverIndex == null
            ? null
            : {
                x: toX(hoverIndex),
                y: Math.min(
                  ...lines.map((line) =>
                    line.values[hoverIndex] == null ? padding.top + plotHeight : toY(line.values[hoverIndex])
                  )
                ),
                title: labels[hoverIndex],
                rows: lines
                  .filter((line) => line.values[hoverIndex] != null)
                  .map((line, lineIndex) => ({
                    label: line.label,
                    value: valueFormat(line.values[hoverIndex]),
                    color: line.color || SERIES_COLORS[lineIndex % SERIES_COLORS.length],
                  })),
              }
        }
      />
    </div>
  );
};

// ---------------------------------------------------------------
// Donut - part to whole, at a glance, six segments at most
// ---------------------------------------------------------------
export const DonutChart = ({
  data,
  size = 210,
  centerLabel,
  centerValue,
  valueFormat = formatNumber,
  ariaLabel,
}) => {
  const [hover, setHover] = useState(null);
  const segments = (data || []).filter((segment) => Number(segment.value) > 0);
  const total = segments.reduce((sum, segment) => sum + Number(segment.value), 0);

  if (!total) return <EmptyPlot height={size} />;

  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 6;
  const inner = outer - 26;
  // A 2px gap in the surface colour is what separates neighbouring
  // segments - never a stroke, which would add ink that is not data.
  const gapDegrees = segments.length > 1 ? (2 / (Math.PI * outer)) * 180 : 0;

  // Angles are laid out up front rather than by advancing a counter
  // inside the map: a render pass must not depend on its own side
  // effects, or a re-render that bails out halfway draws a broken ring.
  const arcs = segments.reduce((laid, segment) => {
    const start = laid.length > 0 ? laid[laid.length - 1].end : 0;
    const share = Number(segment.value) / total;
    return [...laid, { segment, share, start, end: start + share * 360 }];
  }, []);

  return (
    <div style={{ ...plotWrapStyle, display: "flex", justifyContent: "center" }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={
          ariaLabel ||
          `Doughnut chart. ${segments.map((s) => `${s.label}: ${valueFormat(s.value)}`).join(", ")}`
        }
        className="viz-plot"
        onMouseLeave={() => setHover(null)}
      >
        {arcs.map(({ segment, share, start, end }, index) => {
          const isActive = hover?.index === index;

          return (
            <path
              key={segment.label}
              d={donutSegmentPath(
                cx,
                cy,
                outer,
                inner,
                start + gapDegrees / 2,
                Math.max(start + gapDegrees / 2, end - gapDegrees / 2)
              )}
              fill={segment.color || SERIES_COLORS[index % SERIES_COLORS.length]}
              className={`viz-mark${isActive ? " is-active" : ""}`}
              onMouseEnter={() =>
                setHover({
                  index,
                  x: cx,
                  y: cy - outer + 8,
                  title: segment.label,
                  rows: [
                    {
                      label: "Count",
                      value: valueFormat(segment.value),
                      color: segment.color || SERIES_COLORS[index % SERIES_COLORS.length],
                    },
                    { label: "Share", value: formatPercent(share * 100, 1) },
                  ],
                })
              }
            />
          );
        })}

        <text x={cx} y={cy - 2} textAnchor="middle" style={donutValueStyle}>
          {centerValue ?? formatCompact(total)}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" style={axisTextStyle}>
          {centerLabel ?? "Total"}
        </text>
      </svg>
      <Tooltip point={hover} />
    </div>
  );
};

// ---------------------------------------------------------------
// Stacked share bar - qualified vs rejected, one row
// ---------------------------------------------------------------
export const ShareBar = ({ segments, height = 22, valueFormat = formatNumber }) => {
  const [ref, width] = useChartWidth();
  const [hover, setHover] = useState(null);
  const rows = (segments || []).filter((segment) => Number(segment.value) > 0);
  const total = rows.reduce((sum, segment) => sum + Number(segment.value), 0);

  if (!total) return <EmptyPlot height={height + 40} />;

  const gap = rows.length > 1 ? 2 : 0;
  const spans = rows.reduce((laid, segment) => {
    const x = laid.length > 0 ? laid[laid.length - 1].x + laid[laid.length - 1].span : 0;
    return [...laid, { segment, x, span: (Number(segment.value) / total) * width }];
  }, []);

  return (
    <div ref={ref} style={plotWrapStyle}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Share bar. ${rows.map((r) => `${r.label}: ${valueFormat(r.value)}`).join(", ")}`}
        className="viz-plot"
        onMouseLeave={() => setHover(null)}
      >
        {spans.map(({ segment, x, span }, index) => {
          const segmentWidth = span - gap;
          const isFirst = index === 0;
          const isLast = index === rows.length - 1;
          const radius = 6;

          return (
            <g key={segment.label}>
              <rect
                x={x}
                y={0}
                width={Math.max(0, segmentWidth)}
                height={height}
                rx={isFirst || isLast ? radius : 0}
                fill={segment.color || SERIES_COLORS[index % SERIES_COLORS.length]}
                className={`viz-mark${hover?.index === index ? " is-active" : ""}`}
                onMouseEnter={() =>
                  setHover({
                    index,
                    x: x + Math.max(0, segmentWidth) / 2,
                    y: 0,
                    title: segment.label,
                    rows: [
                      { label: "Count", value: valueFormat(segment.value) },
                      {
                        label: "Share",
                        value: formatPercent((Number(segment.value) / total) * 100, 1),
                      },
                    ],
                  })
                }
              />
            </g>
          );
        })}
      </svg>
      <Tooltip point={hover} />
    </div>
  );
};

// ---------------------------------------------------------------
// Meter - one ratio against a limit
// ---------------------------------------------------------------
export const Meter = ({ value, max = 100, tone = "accent", label, caption, showValue = true }) => {
  const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / (max || 1)));

  return (
    <div>
      {(label || showValue) && (
        <div style={meterHeadStyle}>
          {label && <span style={meterLabelStyle}>{label}</span>}
          {showValue && <strong style={meterValueStyle}>{formatPercent(ratio * 100)}</strong>}
        </div>
      )}
      <div
        style={meterTrackStyle}
        role="meter"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Progress"}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            borderRadius: "999px",
            background: toneColor(tone),
            transition: "width 520ms cubic-bezier(0.22, 0.68, 0.35, 1)",
          }}
        />
      </div>
      {caption && <p style={meterCaptionStyle}>{caption}</p>}
    </div>
  );
};

// ---------------------------------------------------------------
// Gauge ring - a single score, read at a glance
// ---------------------------------------------------------------
export const GaugeRing = ({
  value,
  max = 100,
  size = 148,
  tone = "accent",
  label,
  caption,
  display,
}) => {
  const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / (max || 1)));
  const stroke = 12;
  const radius = size / 2 - stroke / 2 - 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={gaugeWrapStyle}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={`${label || "Score"}: ${display ?? formatPercent(ratio * 100)}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--viz-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={toneColor(tone)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 620ms cubic-bezier(0.22, 0.68, 0.35, 1)" }}
        />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" style={gaugeValueStyle}>
          {display ?? formatPercent(ratio * 100)}
        </text>
        {label && (
          <text x={size / 2} y={size / 2 + 24} textAnchor="middle" style={axisTextStyle}>
            {label}
          </text>
        )}
      </svg>
      {caption && <p style={gaugeCaptionStyle}>{caption}</p>}
    </div>
  );
};

// ---------------------------------------------------------------
// Mini trend - a term-by-term line small enough to sit inside a card
// ---------------------------------------------------------------
// The tick row underneath is the point of this form: it prints the value
// of every term as text, so the card carries its own data table and the
// chart never becomes the only way to read a number. That is also why
// there are no floating labels on the marks - the row below does that
// job once, in a place where it cannot collide with the line.
export const MiniTrendChart = ({
  points,
  height = 92,
  color = SERIES_COLORS[0],
  valueFormat = formatNumber,
  domain,
  referenceLine,
  emptyMessage = "Not enough history yet.",
  ariaLabel,
}) => {
  const [ref, width] = useChartWidth(320);
  const [hover, setHover] = useState(null);
  const series = (points || []).filter((point) => point && point.value != null);

  if (series.length === 0) {
    return <p style={miniEmptyStyle}>{emptyMessage}</p>;
  }

  const values = series.map((point) => Number(point.value));
  const [domainMin, domainMax] = domain || [
    Math.min(...values, referenceLine?.value ?? Infinity),
    niceCeiling(Math.max(...values, referenceLine?.value ?? 0)),
  ];
  // A flat series would otherwise divide by zero and collapse onto the
  // baseline; give it a band to sit in the middle of.
  const span = domainMax - domainMin || Math.max(1, Math.abs(domainMax) || 1);

  const padding = { top: 12, bottom: 8 };
  const plotHeight = Math.max(10, height - padding.top - padding.bottom);
  // Points sit at the centre of their tick cell rather than at the edges
  // of the plot, so every dot lines up with the label and value printed
  // directly beneath it. Edge-to-edge spacing looks tidier in isolation
  // and misaligns the moment the tick row is added.
  const stepX = width / series.length;
  const toX = (index) => stepX * (index + 0.5);
  const toY = (value) => padding.top + (1 - (value - domainMin) / span) * plotHeight;

  const coords = values.map((value, index) => [toX(index), toY(value)]);
  const linePath = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const baseline = padding.top + plotHeight;
  const areaPath =
    series.length > 1
      ? `${linePath} L${coords[coords.length - 1][0]},${baseline} L${coords[0][0]},${baseline} Z`
      : "";

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <div style={plotWrapStyle}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={
            ariaLabel ||
            `Trend. ${series.map((point) => `${point.label}: ${valueFormat(point.value)}`).join(", ")}`
          }
          onMouseLeave={() => setHover(null)}
        >
          {areaPath && <path d={areaPath} fill={color} opacity="0.1" />}

          {/* Drawn after the wash, or the fill paints over the rule the
              student is meant to be staying above. */}
          {referenceLine != null && (
            <line
              x1={0}
              x2={width}
              y1={toY(referenceLine.value)}
              y2={toY(referenceLine.value)}
              stroke="var(--viz-critical)"
              strokeWidth="1.5"
            />
          )}

          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {coords.map(([x, y], index) => (
            <circle
              key={series[index].label}
              cx={x}
              cy={y}
              r={hover === index ? 5 : 3.5}
              fill={color}
              stroke="var(--viz-surface)"
              strokeWidth="2"
            />
          ))}

          {series.map((point, index) => (
            <rect
              key={`hit-${point.label}`}
              x={toX(index) - stepX / 2}
              y={0}
              width={stepX}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          ))}
        </svg>

        <Tooltip
          point={
            hover == null
              ? null
              : {
                  x: coords[hover][0],
                  y: coords[hover][1],
                  title: series[hover].label,
                  rows: [{ label: "Value", value: valueFormat(series[hover].value), color }],
                }
          }
        />
      </div>

      <ul style={tickRowStyle}>
        {series.map((point, index) => (
          <li key={point.label} style={tickCellStyle(hover === index)}>
            <span style={tickLabelStyle}>{point.shortLabel || point.label}</span>
            <span style={tickValueStyle}>{valueFormat(point.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------
// Mini donut - a two-part split beside its own legend
// ---------------------------------------------------------------
export const MiniDonut = ({ segments, size = 82, thickness = 14, ariaLabel }) => {
  const rows = (segments || []).filter((segment) => Number(segment.value) > 0);
  const total = rows.reduce((sum, segment) => sum + Number(segment.value), 0);

  if (!total) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `${thickness}px solid var(--viz-track)`,
          flex: "0 0 auto",
        }}
        aria-hidden="true"
      />
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2;
  const inner = outer - thickness;
  const gapDegrees = rows.length > 1 ? (2 / (Math.PI * outer)) * 180 : 0;

  const arcs = rows.reduce((laid, segment) => {
    const start = laid.length > 0 ? laid[laid.length - 1].end : 0;
    const share = Number(segment.value) / total;
    return [...laid, { segment, start, end: start + share * 360 }];
  }, []);

  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel || rows.map((row) => `${row.label}: ${row.value}`).join(", ")}
      style={{ flex: "0 0 auto" }}
    >
      {arcs.map(({ segment, start, end }) =>
        // An arc whose start and end land on the same point draws nothing in
        // SVG, so a category holding 100% would render an empty card. A ring
        // drawn as a stroked circle is the same shape without the degenerate
        // arc.
        end - start >= 359.9 ? (
          <circle
            key={segment.label}
            cx={cx}
            cy={cy}
            r={(outer + inner) / 2}
            fill="none"
            stroke={segment.color || SERIES_COLORS[0]}
            strokeWidth={thickness}
          />
        ) : (
          <path
            key={segment.label}
            d={donutSegmentPath(
              cx,
              cy,
              outer,
              inner,
              start + gapDegrees / 2,
              Math.max(start + gapDegrees / 2, end - gapDegrees / 2)
            )}
            fill={segment.color || SERIES_COLORS[0]}
          />
        )
      )}
    </svg>
  );
};

// ---------------------------------------------------------------
// Sparkline - 12 points of context inside a stat tile
// ---------------------------------------------------------------
export const Sparkline = ({ values, width = 96, height = 28, color = "var(--viz-series-1)" }) => {
  const points = (values || []).filter((value) => value != null);
  if (points.length < 2) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((value, index) => {
      const x = index * stepX;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  const lastX = width;
  const lastY = height - 2 - ((points[points.length - 1] - min) / span) * (height - 4);

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <circle cx={lastX - 1} cy={lastY} r="3" fill={color} stroke="var(--viz-surface)" strokeWidth="2" />
    </svg>
  );
};

const miniEmptyStyle = {
  margin: 0,
  padding: "22px 4px",
  fontSize: "12.5px",
  color: colors.muted,
  lineHeight: 1.5,
};

// The tick row doubles as the card's data table, so the numbers are real
// text at a readable size rather than 9px axis furniture.
const tickRowStyle = {
  display: "flex",
  listStyle: "none",
  margin: "6px 0 0",
  padding: 0,
  gap: "2px",
};

const tickCellStyle = (isActive) => ({
  flex: "1 1 0",
  minWidth: 0,
  display: "grid",
  gap: "1px",
  justifyItems: "center",
  textAlign: "center",
  borderRadius: "7px",
  padding: "4px 2px",
  background: isActive ? colors.primarySoft : "transparent",
  transition: "background 150ms ease",
});

const tickLabelStyle = {
  fontSize: "10.5px",
  color: colors.muted,
  fontWeight: 700,
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
};

const tickValueStyle = {
  fontSize: "11.5px",
  color: colors.text,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
};

const legendListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px 18px",
  listStyle: "none",
  margin: "0 0 14px",
  padding: 0,
  fontSize: "13px",
  color: "var(--viz-ink-soft)",
};

const legendItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const legendValueStyle = {
  color: "var(--viz-ink)",
  fontVariantNumeric: "tabular-nums",
};

const plotWrapStyle = {
  position: "relative",
  width: "100%",
};

const tickTextStyle = {
  fill: "var(--viz-ink-muted)",
  fontSize: "11px",
};

const axisTextStyle = {
  fill: "var(--viz-ink-muted)",
  fontSize: "11.5px",
};

const valueTextStyle = {
  fill: "var(--viz-ink)",
  fontSize: "11.5px",
  fontWeight: 700,
};

const donutValueStyle = {
  fill: "var(--viz-ink)",
  fontSize: "26px",
  fontWeight: 700,
};

const gaugeValueStyle = {
  fill: "var(--viz-ink)",
  fontSize: "26px",
  fontWeight: 700,
};

const chartCardStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "16px",
  padding: "clamp(16px, 3vw, 22px)",
  boxShadow: "var(--sh-shadow-md)",
};

const chartHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "14px",
  flexWrap: "wrap",
};

const chartTitleStyle = {
  margin: 0,
  fontSize: "15px",
  letterSpacing: "0.01em",
  color: colors.text,
};

const chartSubtitleStyle = {
  margin: "5px 0 0",
  fontSize: "12.5px",
  color: colors.muted,
  lineHeight: 1.5,
};

const chartActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const chartFootnoteStyle = {
  margin: "14px 0 0",
  fontSize: "12px",
  color: colors.muted,
  lineHeight: 1.6,
};

const ghostButtonStyle = {
  background: "transparent",
  color: colors.primaryDark,
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "12px",
  fontWeight: 700,
};

const emptyPlotStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  border: `1px dashed ${colors.border}`,
  borderRadius: "12px",
  background: colors.pageAlt,
};

const vizTableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

const tableCaptionStyle = {
  textAlign: "left",
  color: colors.muted,
  fontSize: "12px",
  paddingBottom: "8px",
};

const vizThStyle = {
  padding: "9px 10px",
  borderBottom: `1px solid ${colors.border}`,
  color: colors.primaryDark,
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const vizTdStyle = {
  padding: "9px 10px",
  borderBottom: `1px solid ${colors.border}`,
  color: colors.text,
};

const meterHeadStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "7px",
};

const meterLabelStyle = {
  fontSize: "13px",
  color: colors.muted,
  fontWeight: 600,
};

const meterValueStyle = {
  fontSize: "15px",
  color: colors.text,
};

const meterTrackStyle = {
  height: "10px",
  borderRadius: "999px",
  background: "var(--viz-track)",
  overflow: "hidden",
};

const meterCaptionStyle = {
  margin: "8px 0 0",
  fontSize: "12px",
  color: colors.muted,
  lineHeight: 1.55,
};

const gaugeWrapStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "6px",
};

const gaugeCaptionStyle = {
  margin: 0,
  fontSize: "12px",
  color: colors.muted,
  textAlign: "center",
  lineHeight: 1.5,
};
