/* global ND */
var ND = ND || {};

ND.Csv = (function () {
  "use strict";

  var ROW_CAP = 5000;
  var CHART_CAT_CAP = 40;
  var CHART_SERIES_CAP = 12;

  var AGG_LABELS = {
    count: "计数",
    sum: "求和",
    avg: "平均",
    min: "最小",
    max: "最大"
  };

  var FILTER_OPS = [
    { id: "eq", label: "等于" },
    { id: "ne", label: "不等于" },
    { id: "contains", label: "包含" },
    { id: "not_contains", label: "不包含" },
    { id: "gt", label: ">" },
    { id: "gte", label: "≥" },
    { id: "lt", label: "<" },
    { id: "lte", label: "≤" },
    { id: "empty", label: "为空" },
    { id: "not_empty", label: "非空" }
  ];

  function parse(text, opts) {
    opts = opts || {};
    var cap = opts.rowCap == null ? ROW_CAP : opts.rowCap;
    var src = String(text == null ? "" : text);
    if (!src.trim()) {
      return { headers: [], rows: [], truncated: false, delimiter: ",", error: "内容为空" };
    }
    var delimiter = opts.delimiter || detectDelimiter(src);
    var matrix = [];
    var field = "";
    var row = [];
    var inQuotes = false;
    var i = 0;
    var n = src.length;
    var truncated = false;
    while (i < n) {
      var ch = src.charAt(i);
      if (inQuotes) {
        if (ch === "\"") {
          if (src.charAt(i + 1) === "\"") {
            field += "\"";
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }
      if (ch === "\"") {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === delimiter) {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (ch === "\r") {
        i++;
        continue;
      }
      if (ch === "\n") {
        row.push(field);
        field = "";
        matrix.push(row);
        row = [];
        i++;
        if (matrix.length > cap + 1) {
          truncated = true;
          break;
        }
        continue;
      }
      field += ch;
      i++;
    }
    if (!truncated && (field.length || row.length)) {
      row.push(field);
      matrix.push(row);
    }
    if (!matrix.length) {
      return { headers: [], rows: [], truncated: false, delimiter: delimiter, error: "没有可解析的行" };
    }
    var width = 0;
    for (var r = 0; r < matrix.length; r++) if (matrix[r].length > width) width = matrix[r].length;
    for (r = 0; r < matrix.length; r++) {
      while (matrix[r].length < width) matrix[r].push("");
    }
    var headers = matrix[0].map(function (h, idx) {
      var name = String(h || "").trim();
      return name || ("列" + (idx + 1));
    });
    var rows = [];
    for (r = 1; r < matrix.length && rows.length < cap; r++) {
      var obj = {};
      for (var c = 0; c < width; c++) obj[headers[c]] = matrix[r][c];
      rows.push(obj);
    }
    if (matrix.length - 1 > rows.length) truncated = true;
    return {
      headers: headers,
      rows: rows,
      truncated: truncated,
      delimiter: delimiter,
      error: null
    };
  }

  function detectDelimiter(text) {
    var sample = text.slice(0, 4000);
    var counts = { ",": 0, ";": 0, "\t": 0 };
    var inQ = false;
    for (var i = 0; i < sample.length; i++) {
      var ch = sample.charAt(i);
      if (ch === "\"") {
        if (inQ && sample.charAt(i + 1) === "\"") { i++; continue; }
        inQ = !inQ;
        continue;
      }
      if (!inQ && counts[ch] != null) counts[ch]++;
    }
    if (counts["\t"] >= counts[","] && counts["\t"] >= counts[";"] && counts["\t"] > 0) return "\t";
    if (counts[";"] > counts[","]) return ";";
    return ",";
  }

  function toNumber(value) {
    if (value == null) return NaN;
    var s = String(value).trim();
    if (!s) return NaN;
    s = s.replace(/,/g, "");
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return Number(s);
    return NaN;
  }

  function cellText(value) {
    return value == null ? "" : String(value);
  }

  function inferColumns(parsed) {
    var headers = (parsed && parsed.headers) || [];
    var rows = (parsed && parsed.rows) || [];
    var numeric = [];
    var categorical = [];
    headers.forEach(function (name) {
      var hit = 0;
      var total = 0;
      for (var i = 0; i < rows.length && i < 200; i++) {
        var raw = rows[i][name];
        if (raw == null || String(raw).trim() === "") continue;
        total++;
        if (!isNaN(toNumber(raw))) hit++;
      }
      if (total && hit / total >= 0.7) numeric.push(name);
      else categorical.push(name);
    });
    return { numeric: numeric, categorical: categorical.length ? categorical : headers.slice() };
  }

  function matchFilter(row, filter) {
    if (!filter || !filter.field) return true;
    var raw = row[filter.field];
    var text = cellText(raw).trim();
    var op = filter.op || "eq";
    var expect = filter.value == null ? "" : String(filter.value);
    if (op === "empty") return text === "";
    if (op === "not_empty") return text !== "";
    if (op === "contains") return text.indexOf(expect) >= 0;
    if (op === "not_contains") return text.indexOf(expect) < 0;
    if (op === "eq") return text === expect;
    if (op === "ne") return text !== expect;
    var left = toNumber(raw);
    var right = toNumber(expect);
    if (isNaN(left) || isNaN(right)) return false;
    if (op === "gt") return left > right;
    if (op === "gte") return left >= right;
    if (op === "lt") return left < right;
    if (op === "lte") return left <= right;
    return true;
  }

  function applyFilters(rows, filters) {
    var list = rows || [];
    var rules = (filters || []).filter(function (f) { return f && f.field; });
    if (!rules.length) return list.slice();
    return list.filter(function (row) {
      for (var i = 0; i < rules.length; i++) {
        if (!matchFilter(row, rules[i])) return false;
      }
      return true;
    });
  }

  function metricLabel(metric) {
    var agg = (metric && metric.agg) || "count";
    var field = metric && metric.field;
    if (agg === "count") return AGG_LABELS.count + (field ? "(" + field + ")" : "");
    return (AGG_LABELS[agg] || agg) + "(" + (field || "?") + ")";
  }

  function finishMetric(bucket, agg) {
    if (agg === "sum") return bucket.sum;
    if (agg === "avg") return bucket.count ? bucket.sum / bucket.count : 0;
    if (agg === "min") return bucket.count ? bucket.min : 0;
    if (agg === "max") return bucket.count ? bucket.max : 0;
    return bucket.n;
  }

  function round3(v) {
    return Math.round(v * 1000) / 1000;
  }

  function uniquePreserve(list) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var key = list[i];
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(key);
    }
    return out;
  }

  function aggregate(parsed, opts) {
    opts = opts || {};
    var dims = (opts.dims || []).filter(Boolean).slice(0, 3);
    var metrics = (opts.metrics && opts.metrics.length) ? opts.metrics.slice(0, 6) : [{ field: "", agg: "count" }];
    metrics = metrics.map(function (m) {
      return {
        field: m.field || "",
        agg: m.agg || "count"
      };
    });
    var allRows = (parsed && parsed.rows) || [];
    var rows = applyFilters(allRows, opts.filters);
    var map = Object.create(null);
    var order = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var parts = dims.map(function (d) {
        var t = cellText(row[d]).trim();
        return t || "(空)";
      });
      var key = parts.length ? parts.join("\u0001") : "__all__";
      if (!map[key]) {
        map[key] = {
          parts: parts,
          metrics: metrics.map(function () {
            return { sum: 0, count: 0, n: 0, min: Infinity, max: -Infinity };
          })
        };
        order.push(key);
      }
      var group = map[key];
      for (var m = 0; m < metrics.length; m++) {
        var bucket = group.metrics[m];
        var metric = metrics[m];
        if (metric.agg === "count") {
          if (!metric.field || cellText(row[metric.field]).trim() !== "") bucket.n++;
          continue;
        }
        bucket.n++;
        var num = toNumber(row[metric.field]);
        if (isNaN(num)) continue;
        bucket.sum += num;
        bucket.count++;
        if (num < bucket.min) bucket.min = num;
        if (num > bucket.max) bucket.max = num;
      }
    }

    var groups = order.map(function (key) {
      var g = map[key];
      return {
        keys: g.parts.slice(),
        label: g.parts.length ? g.parts.join(" / ") : "全部",
        values: g.metrics.map(function (bucket, idx) {
          return round3(finishMetric(bucket, metrics[idx].agg));
        })
      };
    });

    var labels = [];
    var series = [];
    var yLabels = [];
    var heat = [];
    var truncated = false;

    if (dims.length <= 1) {
      for (i = 0; i < groups.length && labels.length < CHART_CAT_CAP; i++) {
        labels.push(groups[i].label);
      }
      truncated = groups.length > labels.length;
      for (var s = 0; s < metrics.length; s++) {
        series.push({
          name: metricLabel(metrics[s]),
          values: labels.map(function (_, idx) { return groups[idx].values[s]; })
        });
      }
    } else {
      var xOrder = uniquePreserve(groups.map(function (g) { return g.keys[0]; }));
      var yOrder = uniquePreserve(groups.map(function (g) { return g.keys.slice(1).join(" / "); }));
      if (xOrder.length > CHART_CAT_CAP) {
        xOrder = xOrder.slice(0, CHART_CAT_CAP);
        truncated = true;
      }
      if (yOrder.length > CHART_SERIES_CAP) {
        yOrder = yOrder.slice(0, CHART_SERIES_CAP);
        truncated = true;
      }
      labels = xOrder;
      yLabels = yOrder;
      var lookup = Object.create(null);
      groups.forEach(function (g) {
        lookup[g.keys[0] + "\u0001" + g.keys.slice(1).join(" / ")] = g.values;
      });
      var seriesCount = 0;
      for (var yi = 0; yi < yOrder.length; yi++) {
        for (var mi = 0; mi < metrics.length; mi++) {
          if (seriesCount >= CHART_SERIES_CAP) {
            truncated = true;
            break;
          }
          var name = yOrder[yi];
          if (metrics.length > 1) name += " · " + metricLabel(metrics[mi]);
          series.push({
            name: name,
            values: xOrder.map(function (x) {
              var vals = lookup[x + "\u0001" + yOrder[yi]];
              return vals ? vals[mi] : 0;
            })
          });
          seriesCount++;
        }
        if (seriesCount >= CHART_SERIES_CAP) break;
      }
      if (metrics.length) {
        for (yi = 0; yi < yOrder.length; yi++) {
          for (var xi = 0; xi < xOrder.length; xi++) {
            var hit = lookup[xOrder[xi] + "\u0001" + yOrder[yi]];
            heat.push([xi, yi, hit ? hit[0] : 0]);
          }
        }
      }
    }

    return {
      totalCount: allRows.length,
      filteredCount: rows.length,
      dims: dims,
      metrics: metrics,
      groups: groups,
      labels: labels,
      series: series,
      yLabels: yLabels,
      heat: heat,
      truncated: truncated
    };
  }

  function pivot(parsed, category, value, agg) {
    return aggregate(parsed, {
      dims: category ? [category] : [],
      metrics: [{ field: value || "", agg: agg || "count" }]
    });
  }

  return {
    ROW_CAP: ROW_CAP,
    CHART_CAT_CAP: CHART_CAT_CAP,
    AGG_LABELS: AGG_LABELS,
    FILTER_OPS: FILTER_OPS,
    parse: parse,
    inferColumns: inferColumns,
    applyFilters: applyFilters,
    aggregate: aggregate,
    pivot: pivot,
    metricLabel: metricLabel,
    toNumber: toNumber
  };
})();
