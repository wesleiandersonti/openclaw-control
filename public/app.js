async function login() {
  const user = document.getElementById('user').value;
  const pass = document.getElementById('pass').value;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, pass })
  });

  const data = await res.json();

  if (data.ok) {
    localStorage.setItem("token", data.accessToken);
    document.getElementById('loginContainer').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    loadBurnRate(1);
  } else {
    document.getElementById('error').innerText = "Credenciais inválidas";
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  localStorage.removeItem("token");
  location.reload();
}

async function checkGateway() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.status === 'ok') {
      document.getElementById('gatewayStatus').innerText = "🟢 Sistema Online";
      document.getElementById('gatewayStatus').style.color = "#4cd137";
    }
  } catch {
    document.getElementById('gatewayStatus').innerText = "🔴 Sistema Offline";
    document.getElementById('gatewayStatus').style.color = "#ff4d6d";
  }
}

async function loadBurnRate(keyId) {
  const valuesEl = document.getElementById("burn-values");
  const progressEl = document.getElementById("burn-progress");
  const metaEl = document.getElementById("burn-meta");

  if (!valuesEl || !progressEl || !metaEl) {
    return;
  }

  const token = localStorage.getItem("token");
  if (!token) {
    return;
  }

  try {
    const res = await fetch(`/api/limits/burn-rate/${keyId}`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      return;
    }

    const data = await res.json();

    const percent = data.dailyLimit
      ? (data.todayCost / data.dailyLimit) * 100
      : 0;

    valuesEl.innerText = `$${data.todayCost?.toFixed(2) || "0.00"} / $${data.dailyLimit?.toFixed(2) || "∞"}`;

    progressEl.style.width = Math.min(percent, 100) + "%";

    if (data.level === "danger") {
      progressEl.style.background = "#ff4d4d";
    } else if (data.level === "warning") {
      progressEl.style.background = "#ffc107";
    } else {
      progressEl.style.background = "#00d4ff";
    }

    let timeText = "";

    if (data.estimatedHoursToLimit) {
      const hours = Math.floor(data.estimatedHoursToLimit);
      const minutes = Math.floor((data.estimatedHoursToLimit - hours) * 60);
      timeText = `Atinge limite em ${hours}h ${minutes}m`;
    } else {
      timeText = "Sem consumo recente";
    }

    metaEl.innerText = `${timeText} • Nível: ${data.level?.toUpperCase() || "NORMAL"}`;
  } catch (error) {
    console.error("[burn-rate] error:", error);
  }
}

// Auto refresh burn rate every 30 seconds
setInterval(() => {
  const dashboard = document.getElementById("dashboard");
  if (dashboard && !dashboard.classList.contains("hidden")) {
    loadBurnRate(1);
  }
}, 30000);

checkGateway();
