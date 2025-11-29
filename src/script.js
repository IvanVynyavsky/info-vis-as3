/*
US Accidents (Kaggle) 2016-2023
Visuals: Choropleth map by state (counts or average severity).
Data: stateMonthData (state + year_month aggregates), stateSummary (per-state totals/avg).
AI usage: Portions of this code were drafted with help from a generative AI assistant.
*/

// ---------------------------------------------------------------------------//
// File paths
// ---------------------------------------------------------------------------//
const stateMonthPath = "data/us_accidents_state_month.csv";
const statesGeoPath = "data/us_states.geojson";

// ---------------------------------------------------------------------------//
// Parsers and formatters
// ---------------------------------------------------------------------------//
const formatNumber = d3.format(",");
const formatSeverity = d3.format(".2f");
const formatCount = formatNumber;

// ---------------------------------------------------------------------------//
// Data containers and state
// ---------------------------------------------------------------------------//
let stateMonthData = [];
let usStates = null;
let stateSummary = new Map();
let selectedState = "CA";
let currentMetric = "count"; // "count" or "severity"
let legendRange = { min: 0, max: 1 };

let tooltip;

// Map chart globals
let mapSvg, mapGroup, projection, pathGenerator, colorScale;

// ---------------------------------------------------------------------------//
// Data loading
// ---------------------------------------------------------------------------//
Promise.all([
  d3.csv(stateMonthPath, stateMonthParserFn),
  d3.json(statesGeoPath),
]).then(([stateMonth, statesGeo]) => {
  stateMonthData = stateMonth;
  usStates = statesGeo;

  stateSummary = buildStateSummary(stateMonthData);

  // Use a state that exists in the data as default.
  if (!stateSummary.has(selectedState)) {
    const firstKey = stateSummary.keys().next().value;
    selectedState = firstKey || "CA";
  }

  updateMetricDescription(currentMetric);
  tooltip = createTooltip();
  initMap();
  attachControls();
}).catch((err) => {
  console.error("Error loading data:", err);
});

function stateMonthParserFn(d) {
  return {
    state: d.state,
    year_month: d.year_month,
    year: +d.year,
    count_accidents: +d.count_accidents,
    avg_severity: +d.avg_severity,
  };
}

// ---------------------------------------------------------------------------//
// Helpers
// ---------------------------------------------------------------------------//
function createTooltip() {
  const t = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip");
  return t;
}

function showTooltip(html, event) {
  tooltip
    .html(html)
    .style("left", `${event.pageX + 12}px`)
    .style("top", `${event.pageY + 12}px`)
    .style("opacity", 1);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

function buildStateSummary(data) {
  const summary = new Map();
  data.forEach((d) => {
    const code = (d.state || "").toUpperCase();
    if (!code) return;
    const entry = summary.get(code) || {
      totalCount: 0,
      weightedSeverity: 0,
    };
    entry.totalCount += d.count_accidents;
    entry.weightedSeverity += d.avg_severity * d.count_accidents;
    summary.set(code, entry);
  });

  summary.forEach((entry, code) => {
    entry.avgSeverity =
      entry.totalCount > 0 ? entry.weightedSeverity / entry.totalCount : 0;
    delete entry.weightedSeverity;
  });
  return summary;
}

function extractStateCode(feature) {
  const props = feature.properties || {};
  const candidates = [
    props.STUSPS,
    props.STUSPS10, // present in this GeoJSON
    props.state_code,
    props.STATE,
    props.CODE,
    props.code,
    props.postal,
    props.postalCode,
  ];
  return (candidates.find((c) => typeof c === "string" && c.trim().length) || "").trim();
}

function extractStateName(feature) {
  const props = feature.properties || {};
  return (
    props.NAME || props.NAME10 || props.name || props.state_name || extractStateCode(feature) || "State"
  ).toString();
}

function attachControls() {
  d3.select("#metric-select").on("change", (event) => {
    currentMetric = event.target.value;
    updateMetricDescription(currentMetric);
    updateMapColors();
  });
}

function updateMetricDescription(metric) {
  if (metric === "count") {
    d3.select("#metric-description").text(
      "Total number of reported accidents in each state between 2016 and 2023."
    );
  } else {
    d3.select("#metric-description").text(
      "Average severity of accidents in each state (1 = minor, 4 = most severe)."
    );
  }
}

// ---------------------------------------------------------------------------//
// Map
// ---------------------------------------------------------------------------//
function initMap() {
  const container = d3.select("#map");
  const width = 900;
  const height = 500;
  const margin = { top: 10, right: 10, bottom: 10, left: 10 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  mapSvg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  mapGroup = mapSvg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  projection = d3.geoAlbersUsa().fitSize([innerWidth, innerHeight], usStates);
  pathGenerator = d3.geoPath().projection(projection);

  updateColorScale();
  updateLegend();

  mapGroup
    .selectAll("path.state")
    .data(usStates.features)
    .join("path")
    .attr("class", "state")
    .attr("d", pathGenerator)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 0.7)
    .attr("fill", (d) => {
      const code = extractStateCode(d);
      return colorScale(getMetricValue(code));
    })
    .on("mouseover", function (event, d) {
      const code = extractStateCode(d);
      const name = extractStateName(d);
      const stats = stateSummary.get(code);
      const html = stats
        ? `<strong>${name} (${code})</strong><br/>Accidents: ${formatNumber(
            stats.totalCount,
          )}<br/>Avg severity: ${formatSeverity(stats.avgSeverity)}`
        : `<strong>${name}</strong><br/>No data`;
      d3.select(this).attr("stroke-width", 1.5);
      showTooltip(html, event);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
    })
    .on("mouseout", function () {
      d3.select(this).attr("stroke-width", 0.7);
      hideTooltip();
    })
    .on("click", function (event, d) {
      const code = extractStateCode(d);
      if (!code) return;
      selectedState = code;
      mapGroup.selectAll(".state").classed("selected", false);
      d3.select(this).classed("selected", true);
    })
    .transition()
    .duration(900)
    .attr("fill", (d) => {
      const code = extractStateCode(d);
      return colorScale(getMetricValue(code));
    });

  // Highlight default selection if present.
  mapGroup
    .selectAll(".state")
    .filter((d) => extractStateCode(d) === selectedState)
    .classed("selected", true);
}

function updateColorScale() {
  if (currentMetric === "count") {
    const counts = Array.from(stateSummary.values(), (d) => d.totalCount);
    const [minCountRaw, maxCountRaw] = d3.extent(counts);
    const minCount = Number.isFinite(minCountRaw) ? minCountRaw : 0;
    const maxCount = Number.isFinite(maxCountRaw) ? maxCountRaw : 1;
    const domainMax = maxCount === minCount ? minCount + 1 : maxCount;
    colorScale = d3.scaleSequential(d3.interpolateReds).domain([minCount, domainMax]);
    legendRange = { min: minCount, max: maxCount };
  } else {
    const severities = Array.from(stateSummary.values(), (d) => d.avgSeverity || 0);
    const [minSevRaw, maxSevRaw] = d3.extent(severities);
    const minSev = Number.isFinite(minSevRaw) ? minSevRaw : 0;
    const maxSev = Number.isFinite(maxSevRaw) ? maxSevRaw : 1;
    const padding = 0.05;
    let domainMin = minSev - padding;
    let domainMax = maxSev + padding;
    if (domainMax <= domainMin) {
      domainMax = domainMin + 0.1;
    }
    colorScale = d3.scaleSequential(d3.interpolateBlues).domain([domainMin, domainMax]);
    legendRange = { min: minSev, max: maxSev };
  }
}

function updateMapColors() {
  updateColorScale();
  updateLegend();

  mapGroup
    .selectAll(".state")
    .transition()
    .duration(600)
    .attr("fill", (d) => {
      const code = extractStateCode(d);
      return colorScale(getMetricValue(code));
    });
}

function getMetricValue(stateCode) {
  const stats = stateSummary.get((stateCode || "").toUpperCase());
  if (!stats) return 0;
  return currentMetric === "count" ? stats.totalCount : stats.avgSeverity;
}

function updateLegend() {
  const isCount = currentMetric === "count";
  const lowLabel = isCount ? "Low accidents" : "Lower severity";
  const highLabel = isCount ? "High accidents" : "Higher severity";
  const minVal = legendRange.min;
  const maxVal = legendRange.max;

  d3.select("#legend-label-low").text(lowLabel);
  d3.select("#legend-label-high").text(highLabel);

  d3.select("#legend-gradient").style(
    "background",
    isCount
      ? "linear-gradient(90deg, #fee2e2, #b91c1c)"
      : "linear-gradient(90deg, #e0f2fe, #1d4ed8)",
  );

  d3.select("#legend-min").text(isCount ? formatCount(minVal) : formatSeverity(minVal));
  d3.select("#legend-max").text(isCount ? formatCount(maxVal) : formatSeverity(maxVal));
}
