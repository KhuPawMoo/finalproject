/* Browser-side dashboard code. It calls only this local Flask application. */
(() => {
  let symbol = window.CryptoPredictor.initialSymbol;
  let interval = "1h";
  const $ = (selector) => document.querySelector(selector);
  const money = (value) => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 100 ? 2 : 5 }).format(value);
  const number = (value) => value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  const html = (value) => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const setStatus = (message, type = "") => { const status = $("#status-message"); status.textContent = message; status.className = `status ${type}`; };
  const setBusy = (button, busy, text) => { button.disabled = busy; button.dataset.label ||= button.textContent; button.textContent = busy ? text : button.dataset.label; };

  function renderChart(candles, values) {
    const target = $("#price-chart");
    if (!candles.length) { target.innerHTML = '<p class="empty">No stored candles for this timeframe. Use “Refresh market data & news.”</p>'; return; }
    const time = candles.map(c => new Date(c.timestamp));
    const colors = { up: "#69e5b2", down: "#ff7f8d" };
    const traces = [
      { type:"candlestick", x:time, open:candles.map(c=>c.open), high:candles.map(c=>c.high), low:candles.map(c=>c.low), close:candles.map(c=>c.close), name:"Price", increasing:{line:{color:colors.up}}, decreasing:{line:{color:colors.down}}, yaxis:"y" },
      { type:"bar", x:time, y:candles.map(c=>c.volume), name:"Volume", marker:{color:"#4e6c94"}, yaxis:"y2", opacity:.72 },
      { type:"scatter", mode:"lines", x:time, y:candles.map(c=>c.ema_20), name:"EMA 20", line:{color:"#69e5b2", width:1.4}, yaxis:"y" },
      { type:"scatter", mode:"lines", x:time, y:candles.map(c=>c.ema_50), name:"EMA 50", line:{color:"#78aaff", width:1.3}, yaxis:"y" },
      { type:"scatter", mode:"lines", x:time, y:candles.map(c=>c.ema_200), name:"EMA 200", line:{color:"#ffc96b", width:1.2}, yaxis:"y" },
    ];
    const shapes = [];
    if (values.support != null) shapes.push({type:"line", xref:"paper", x0:0, x1:1, yref:"y", y0:values.support, y1:values.support, line:{color:"#69e5b2", dash:"dot", width:1}});
    if (values.resistance != null) shapes.push({type:"line", xref:"paper", x0:0, x1:1, yref:"y", y0:values.resistance, y1:values.resistance, line:{color:"#ff7f8d", dash:"dot", width:1}});
    Plotly.react(target, traces, { paper_bgcolor:"transparent", plot_bgcolor:"transparent", margin:{l:55,r:10,t:8,b:26}, font:{color:"#9aabc0", size:11}, xaxis:{rangeslider:{visible:false}, gridcolor:"#23344b", showgrid:false}, yaxis:{domain:[.28,1], gridcolor:"#23344b", fixedrange:false}, yaxis2:{domain:[0,.19], gridcolor:"#23344b", title:"", fixedrange:true}, legend:{orientation:"h", y:1.12, font:{size:10}}, shapes }, {responsive:true, displayModeBar:false});
  }

  function renderIndicators(values, explanations) {
    const rows = [["RSI", values.rsi], ["MACD", values.macd], ["EMA 20", values.ema_20], ["EMA 50", values.ema_50], ["EMA 200", values.ema_200], ["ATR", values.atr], ["Support", values.support], ["Resistance", values.resistance], ["Recent high", values.recent_high]];
    $("#indicator-values").innerHTML = rows.map(([name, value]) => `<div class="indicator-cell"><span>${name}</span><b>${number(value)}</b></div>`).join("");
    $("#technical-explanations").innerHTML = explanations.map(item => `<li>${html(item)}</li>`).join("");
  }

  function renderPredictions(predictions) {
    const mostRecentByHorizon = new Map();
    predictions.forEach(prediction => { if (!mostRecentByHorizon.has(prediction.horizon_label)) mostRecentByHorizon.set(prediction.horizon_label, prediction); });
    const items = [...mostRecentByHorizon.values()];
    $("#prediction-list").innerHTML = items.length ? items.map(p => `<div class="prediction"><div class="prediction-top"><h3>${html(p.horizon_label)} estimate</h3><span class="confidence">${html(p.confidence)} confidence</span></div><div class="range-row"><div><strong>Bearish</strong>${money(p.bearish_low)} – ${money(p.bearish_high)}</div><div><strong>Neutral</strong>${money(p.neutral_low)} – ${money(p.neutral_high)}</div><div><strong>Bullish</strong>${money(p.bullish_low)} – ${money(p.bullish_high)}</div></div><small>${html(p.confidence_reason)}</small></div>`).join("") : '<p class="empty">Refresh 1-hour data, then train models to generate estimates.</p>';
  }

  function renderNews(articles) {
    $("#more-news").href = `/news?symbol=${encodeURIComponent(symbol)}`;
    $("#news-list").innerHTML = articles.length ? articles.slice(0, 5).map(a => `<div class="news-item"><div class="news-meta"><span class="sentiment ${String(a.sentiment).toLowerCase()}">${html(a.sentiment)}</span><span>${html(a.source)}</span><span>· ${new Date(a.published_at).toLocaleDateString()}</span></div><h3><a href="${html(a.url)}" target="_blank" rel="noopener">${html(a.title)}</a></h3><span class="muted">${html(a.impact)} potential impact — ${html(a.impact_reason)}</span></div>`).join("") : '<p class="empty">No relevant news stored yet.</p>';
  }

  function renderPerformance(items) {
    $("#performance-list").innerHTML = items.length ? items.slice(0, 8).map(item => `<div class="performance-item"><b>${html(item.model_name)}<br><span>${html(item.horizon_label)}</span></b><div><span>Rows</span><br>${number(item.sample_count)}</div><div><span>MAPE</span><br>${number(item.mape)}%</div><div><span>Direction</span><br>${number(item.directional_accuracy)}%</div></div>`).join("") : '<p class="empty">Performance appears after a model is trained. Older predictions are evaluated as matching candles arrive.</p>';
  }

  function render(data) {
    const ticker = data.ticker || {};
    const values = data.indicators || {};
    $("#chart-title").textContent = `${symbol} · ${interval.toUpperCase()} chart`;
    $("#current-price").textContent = money(ticker.price ?? values.close);
    const change = ticker.change_percent;
    $("#change-24h").textContent = change == null ? "—" : `${change >= 0 ? "+" : ""}${number(change)}%`;
    $("#change-24h").style.color = change > 0 ? "#69e5b2" : change < 0 ? "#ff7f8d" : "";
    $("#high-low").textContent = ticker.high_24h == null ? "—" : `${money(ticker.high_24h)} / ${money(ticker.low_24h)}`;
    $("#volume-24h").textContent = number(ticker.volume_24h);
    $("#data-source").textContent = ticker.source || "No stored market snapshot";
    $("#updated-time").textContent = ticker.updated_at ? `Updated ${new Date(ticker.updated_at).toLocaleString()}` : "Not updated yet";
    $("#market-trend").textContent = data.analysis?.trend || "Waiting for data";
    $("#volatility").textContent = data.analysis?.volatility || "—";
    $("#news-sentiment").textContent = data.analysis?.news?.label || "—";
    $("#rsi-value").textContent = values.rsi == null ? "—" : number(values.rsi);
    $("#macd-value").textContent = values.macd == null ? "—" : number(values.macd);
    $("#analysis-why").textContent = data.analysis?.why || "Refresh market data to create an analysis.";
    $("#prediction-note").textContent = data.analysis?.prediction_note || "";
    renderChart(data.candles || [], values); renderIndicators(values, data.explanations || []); renderPredictions(data.predictions || []); renderNews(data.news || []); renderPerformance(data.performance || []);
  }

  async function loadDashboard() {
    setStatus("Loading locally stored data…");
    try { const response = await fetch(`/api/dashboard/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); render(data); setStatus(data.candles?.length ? "Showing locally stored data." : "No data stored yet. Use Refresh to start.", data.candles?.length ? "success" : ""); }
    catch (error) { setStatus(error.message || "Could not load dashboard.", "error"); }
  }

  $("#refresh-button").addEventListener("click", async () => { const button = $("#refresh-button"); setBusy(button, true, "Refreshing…"); setStatus("Downloading public Binance candles and relevant news…"); try { const response = await fetch(`/api/refresh/${encodeURIComponent(symbol)}`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({display_interval:interval})}); const data = await response.json(); if (!response.ok) throw new Error(data.error); render(data.dashboard); const warnings = [...(data.market.errors || []), data.news_refresh.error].filter(Boolean); setStatus(warnings.length ? `Data refreshed with warnings: ${warnings.join(" | ")}` : `Refreshed ${Object.values(data.market.updated || {}).reduce((sum, count) => sum + count, 0)} candles and ${data.news_refresh.saved} news articles.`, warnings.length ? "error" : "success"); } catch (error) { setStatus(error.message || "Refresh failed. Cached data was kept.", "error"); } finally { setBusy(button, false); } });
  $("#analyze-button").addEventListener("click", async () => { const button = $("#analyze-button"); setBusy(button, true, "Training…"); setStatus("Training Linear Regression and Random Forest with a time-based test split…"); try { const response = await fetch(`/api/analyze/${encodeURIComponent(symbol)}`, {method:"POST"}); const data = await response.json(); if (!response.ok) throw new Error(data.error); render(data.dashboard); const made = data.result.predictions?.length || 0; const errors = data.result.errors || []; setStatus(made ? `Created ${made} cautious prediction ranges.${errors.length ? ` Some horizons need more history: ${errors.join(" ")}` : ""}` : errors.join(" ") || "No predictions could be made yet.", made ? "success" : "error"); } catch (error) { setStatus(error.message || "Analysis failed.", "error"); } finally { setBusy(button, false); } });
  $("#symbol-select").addEventListener("change", event => { symbol = event.target.value; loadDashboard(); });
  $("#use-custom").addEventListener("click", () => { const custom = $("#custom-symbol").value.trim().toUpperCase(); if (!/^[A-Z0-9]{5,20}$/.test(custom)) { setStatus("Use letters and numbers only, such as DOGEUSDT.", "error"); return; } symbol = custom; loadDashboard(); });
  $("#timeframe-buttons").addEventListener("click", event => { const button = event.target.closest("button[data-interval]"); if (!button) return; interval = button.dataset.interval; document.querySelectorAll("#timeframe-buttons button").forEach(item => item.classList.toggle("active", item === button)); loadDashboard(); });
  loadDashboard();
})();
