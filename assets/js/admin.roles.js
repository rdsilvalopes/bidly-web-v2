/* Bidly • Admin • Gestão de papéis (produção) */
(async () => {
  const sb = await window.connectSupabase();       // helper do seu supa.js
  const $  = (s, r = document) => r.querySelector(s);

  const grid      = $('#grid');
  const gridBody  = $('#grid tbody');
  const bootBar   = $('#bootstrapBar');
  const formBar   = $('#grantRevokeBar');
  const emailIn   = $('#email');
  const roleSel   = $('#role');

  // Precisa de sessão (login no app)
  const { data: sess } = await sb.auth.getSession();
  if (!sess || !sess.session) {
    alert('Faça login no app antes de abrir esta página.');
    location.href = '/admin/login.html';
    return;
  }

  const showBootstrapOnly = () => {
    if (grid)   grid.style.display = 'none';
    if (formBar) formBar.style.display = 'none';
    if (bootBar) bootBar.style.display = '';
  };
  const showFullUI = () => {
    if (grid)   grid.style.display = '';
    if (formBar) formBar.style.display = '';
    if (bootBar) bootBar.style.display = 'none';
  };

  function fmtDate(s){
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  async function loadGrid() {
    // segue usando o wrapper PÚBLICO
    const { data, error } = await sb.rpc('list_admins');
    if (error) {
      if (String(error.code) === '42501') { // forbidden -> sem papel ainda
        showBootstrapOnly();
        return;
      }
      console.error(error);
      alert('Não foi possível carregar.');
      return;
    }

    showFullUI();

    const rowsHtml = (data && data.length)
      ? data.map(r => {
          const userEmail = r.email || '—';
          const role      = r.role || '—';
          const when      = fmtDate(r.granted_at);     // mantém contrato atual
          const whoEmail  = r.granted_by_email || '—'; // mantém contrato atual
          return `
            <tr>
              <td>${userEmail}</td>
              <td>${role}</td>
              <td>${when}</td>
              <td>${whoEmail}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="4" class="muted">Nenhum papel atribuído.</td></tr>';

    if (gridBody) gridBody.innerHTML = rowsHtml;
  }

  // Bootstrap (cria o primeiro adm.master se não existir)
  $('#btnBootstrap')?.addEventListener('click', async () => {
    if (!confirm('Confirmar bootstrap? Só funciona se ainda não houver adm.master.')) return;
    const { error } = await sb.rpc('bootstrap_admin'); // público
    if (error) { alert(error.message || 'Falhou.'); return; }
    alert('Pronto! Você agora é adm.master.');
    await loadGrid();
  });

  // Conceder papel — volta ao público (como estava)
  $('#btnGrant')?.addEventListener('click', async () => {
    const email = (emailIn?.value || '').trim();
    const role  = (roleSel?.value || '').trim();
    if (!email) return alert('Informe o e-mail.');
    if (!role)  return alert('Selecione um papel.');

    const { error } = await sb.rpc('grant_role', { p_email: email, p_role: role });
    if (error) { alert(error.message || 'Falha ao conceder.'); return; }
    await loadGrid();
  });

  // Revogar papel — volta ao público (como estava)
  $('#btnRevoke')?.addEventListener('click', async () => {
    const email = (emailIn?.value || '').trim();
    const role  = (roleSel?.value || '').trim();
    if (!email) return alert('Informe o e-mail.');
    if (!role)  return alert('Selecione um papel.');

    const { error } = await sb.rpc('revoke_role', { p_email: email, p_role: role });
    if (error) { alert(error.message || 'Falha ao revogar.'); return; }
    await loadGrid();
  });

  await loadGrid();
})();
