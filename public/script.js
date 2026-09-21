async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    document.getElementById("endpoint-badge").textContent =
      `${cfg.baseUrl}  ·  text: ${cfg.textModel}`;
  } catch {
    document.getElementById("endpoint-badge").textContent = "Could not load endpoint config.";
  }
}

async function loadTargetEngines() {
  const select = document.getElementById("target-engine");
  try {
    const res = await fetch("/api/target-engines");
    const { engines } = await res.json();
    select.innerHTML = "";
    engines.forEach((engine, i) => {
      const opt = document.createElement("option");
      opt.value = engine;
      opt.textContent = engine;
      if (engine === "PostgreSQL") opt.selected = true;
      select.appendChild(opt);
    });
  } catch {
    select.innerHTML = '<option value="PostgreSQL">PostgreSQL</option>';
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Small renderer for the model's "## Heading" + fenced code block output.
function renderMigrationText(text) {
  const lines = text.split("\n");
  let html = "";
  let inCode = false;
  let codeBuf = [];

  const flushCode = () => {
    if (codeBuf.length) {
      html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
      codeBuf = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (line.trim().startsWith("## ")) {
      html += `<h2>${escapeHtml(line.trim().slice(3))}</h2>`;
    } else if (line.trim()) {
      html += `<p>${escapeHtml(line)}</p>`;
    }
  }
  flushCode();
  return html || escapeHtml(text);
}

const migrateBtn = document.getElementById("migrate-btn");
const output = document.getElementById("output");
const meta = document.getElementById("meta");

migrateBtn.addEventListener("click", async () => {
  const sourceEngine = document.getElementById("source-engine").value;
  const schema = document.getElementById("schema").value.trim();
  const targetEngine = document.getElementById("target-engine").value;
  const clusterName = document.getElementById("cluster-name").value.trim();
  const region = document.getElementById("region").value.trim();
  const nodeSize = document.getElementById("node-size").value.trim();

  if (!schema) {
    output.textContent = "Paste a source schema or data description first.";
    return;
  }

  migrateBtn.disabled = true;
  output.textContent = "Calling /v1/chat/completions…";
  meta.textContent = "";

  try {
    const res = await fetch("/api/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceEngine, schema, targetEngine, clusterName, region, nodeSize }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    output.innerHTML = renderMigrationText(data.text);
    meta.textContent = `model: ${data.model} · endpoint: ${data.endpoint} · tokens: ${data.usage?.total_tokens ?? "n/a"}`;
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  } finally {
    migrateBtn.disabled = false;
  }
});

loadConfig();
loadTargetEngines();
