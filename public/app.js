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
    document.getElementById('loginContainer').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
  } else {
    document.getElementById('error').innerText = "Credenciais inválidas";
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
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

checkGateway();
