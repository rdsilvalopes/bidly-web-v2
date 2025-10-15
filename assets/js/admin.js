/* assets/js/admin.js — Admin Lite (lista + histórico + edição dos dados da organização) */
(async function () {
  // ---------------- Helpers ----------------
  const $  = (s, c=document) => c.querySelector(s);
  const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));
  const fmt = (s) => (s ?? '').toString().trim();
  const pill = (t, cls='') => `<span class="pill ${cls}">${t}</span>`;
  const date = (iso) => iso ? new Date(iso).toLocaleString() : '—';

  function collectForm(formEl) {
    const o = {};
    new FormData(formEl).forEach((v, k) => o[k] = (v ?? '').toString().trim());
    return o;
  }
  function diff(original, now) {
    const patch = {};
    Object.keys(now).forEach(k => {
      const a = (original?.[k] ?? '');
      const b = (now?.[k] ?? '');
      if (a !== b) patch[k] = b;
    });
    return patch;
  }

  function openInNewTab(url) {
    try { window.open(url, '_blank', 'noopener'); }
    catch { navigator.clipboard?.writeText(url).then(() => alert('Abra o link copiado em uma nova aba.')); }
  }

  // ---------------- UF: lista fixa (padronização no Admin) ----------------
  const UF_LIST = [
    { value: "",  label: "Selecione" },
    { value: "AC", label: "AC — Acre" },
    { value: "AL", label: "AL — Alagoas" },
    { value: "AP", label: "AP — Amapá" },
    { value: "AM", label: "AM — Amazonas" },
    { value: "BA", label: "BA — Bahia" },
    { value: "CE", label: "CE — Ceará" },
    { value: "DF", label: "DF — Distrito Federal" },
    { value: "ES", label: "ES — Espírito Santo" },
    { value: "GO", label: "GO — Goiás" },
    { value: "MA", label: "MA — Maranhão" },
    { value: "MT", label: "MT — Mato Grosso" },
    { value: "MS", label: "MS — Mato Grosso do Sul" },
    { value: "MG", label: "MG — Minas Gerais" },
    { value: "PA", label: "PA — Pará" },
    { value: "PB", label: "PB — Paraíba" },
    { value: "PR", label: "PR — Paraná" },
    { value: "PE", label: "PE — Pernambuco" },
    { value: "PI", label: "PI — Piauí" },
    { value: "RJ", label: "RJ — Rio de Janeiro" },
    { value: "RN", label: "RN — Rio Grande do Norte" },
    { value: "RS", label: "RS — Rio Grande do Sul" },
    { value: "RO", label: "RO — Rondônia" },
    { value: "RR", label: "RR — Roraima" },
    { value: "SC", label: "SC — Santa Catarina" },
    { value: "SP", label: "SP — São Paulo" },
    { value: "SE", label: "SE — Sergipe" },
    { value: "TO", label: "TO — Tocantins" },
  ];

  /** Garante que o campo name="uf" seja um <select> com a lista oficial. */
  function ensureUfSelect() {
    if (!orgForm) return;
    let el = orgForm.querySelector('[name="uf"]');
    if (!el) return;

    // se já é select, popular uma vez e sair
    if (el.tagName.toLowerCase() === 'select') {
      if (!el.dataset.ufBuilt) {
        el.innerHTML = UF_LIST.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        el.dataset.ufBuilt = '1';
      }
      return;
    }

    // trocar input->select preservando classes/valor
    const sel = document.createElement('select');
    sel.name = 'uf';
    sel.id = el.id || 'org_uf';
    sel.className = el.className || 'input';
    sel.innerHTML = UF_LIST.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    const current = (el.value || '').toUpperCase().trim();
    if (current && !UF_LIST.some(u => u.value === current)) {
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = current;
      sel.appendChild(opt);
    }
    sel.value = current;
    el.replaceWith(sel);
  }

  // Fecha/limpa os painéis e volta para a “tela 1” (apenas a lista)
  function resetPanels() {
    try { setOrgMode('view'); } catch (_) {}
    if (orgPanel) orgPanel.style.display = 'none';

    if (elMsgPanel)   elMsgPanel.style.display = 'none';
    if (elMsgText)    elMsgText.value = '';
    if (elMsgHistory) elMsgHistory.innerHTML = '—';

    if (elAudit) elAudit.value = '';

    // esconde a barra de atalho
    if (jumpBar) jumpBar.style.display = 'none';

    state.currentUser = null;
  }

  // ---------------- Estado ----------------
  const state = {
    pass: '',
    reviewer: '',
    q: '',
    limit: 25,
    offset: 0,
    currentUser: null,       // { id, name, document }
  };
  let orgOriginal = null;
  let orgPanelMode = 'view';

  // ---------------- Supabase ----------------
  if (!window.connectSupabase) { alert('supa.js não carregou'); return; }
  const sb = await window.connectSupabase();

  // ---------------- UI principais ----------------
  const elPass   = $('#adminPass') || $('input[type="password"]');
  const elName   = $('#adminName') || $('input[type="text"]');
  const elQ      = $('#q');
  const elGrid   = $('#grid tbody');

  // Painel de mensagem / histórico
  const elMsgPanel   = $('#msgPanel');
  const elMsgText    = $('#msgText');
  const elMsgHistory = $('#msgHistoryBody');
  const elMsgTarget  = $('#msgTarget');
  const elBtnSend    = $('#btnSendNote');

  // Painel “Dados da organização”
  const orgPanel  = $('#org-panel');
  const orgForm   = $('#org-form');
  const btnEdit   = $('#org-edit-btn');
  const btnSave   = $('#org-save-btn');
  const btnCancel = $('#org-cancel-btn');
  const elAudit   = $('#audit_note');

  // Barra de atalho
  const jumpBar   = $('#jumpbar');
  const btnJumpOrg= $('#jumpOrg');
  const btnJumpMsg= $('#jumpMsg');

  function setOrgMode(mode) {
    orgPanelMode = mode;
    const editing = (mode === 'edit');

    // garante select de UF antes de alternar disabled
    ensureUfSelect();

    if (orgForm) {
      [...orgForm.querySelectorAll('input,select,textarea')].forEach(el => el.disabled = !editing);
    }
    // o campo de auditoria só habilita em modo edição
    if (elAudit) elAudit.disabled = !editing;

    if (btnEdit)   btnEdit.style.display   = editing ? 'none' : '';
    if (btnSave)   btnSave.style.display   = editing ? '' : 'none';
    if (btnCancel) btnCancel.style.display = editing ? '' : 'none';
  }

  // ---------------- Top actions ----------------
  $('#btnLoad')?.addEventListener('click', (e) => {
    e?.preventDefault?.();
    state.pass     = fmt(elPass?.value);
    state.reviewer = fmt(elName?.value);
    state.q        = fmt(elQ?.value);
    state.offset   = 0;

    // Ao clicar em Carregar, volta para a tela 1 (só a lista)
    resetPanels();

    load();
  });
  $('#btnPrev')?.addEventListener('click', () => {
    state.offset = Math.max(0, state.offset - state.limit);
    load();
  });
  $('#btnNext')?.addEventListener('click', () => {
    state.offset += state.limit;
    load();
  });
  elQ?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnLoad').click(); });

  // ---------------- Carregar lista (com fallback v2 -> v1) ----------------
  async function load() {
    if (!state.pass) { alert('Informe a senha.'); return; }
    if (!elGrid) return;

    elGrid.innerHTML = `<tr><td colspan="7" class="muted">Carregando…</td></tr>`;

    async function fetchList() {
      // tenta v2
      let r = await sb.rpc('admin_list_docs_v2', {
        p_pass:  state.pass,
        q:       state.q || null,
        p_limit: state.limit,
        p_offset:state.offset
      });

      // se a função não existir, tenta v1
      const notFound =
        r?.error?.message?.toLowerCase?.().includes('admin_list_docs_v2') ||
        r?.error?.message?.toLowerCase?.().includes('does not exist');

      if (notFound) {
        r = await sb.rpc('admin_list_docs', {
          p_pass:  state.pass,
          q:       state.q || null,
          p_limit: state.limit,
          p_offset:state.offset
        });
      }
      return r;
    }

    try {
      const { data, error } = await fetchList();

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('invalid') || msg.includes('senha') || msg.includes('password')) {
          elGrid.innerHTML = `<tr><td colspan="7" class="muted">Senha inválida.</td></tr>`;
        } else {
          elGrid.innerHTML = `<tr><td colspan="7" class="muted">Erro: ${error.message}</td></tr>`;
        }
        return;
      }

      if (!data || !data.length) {
        elGrid.innerHTML = `<tr><td colspan="7" class="muted">Nenhum registro.</td></tr>`;
        return;
      }

      elGrid.innerHTML = '';
      for (const p of data) {
        const row = document.createElement('tr');

        const statusKey = (p.docs_status || 'pending').toLowerCase();
        const statusMap = {
          pending:      pill('Pendente'),
          submitted:    pill('Enviado'),
          under_review: pill('Em análise'),
          rejected:     pill('Reprovado', 'danger'),
          approved:     pill('Aprovado', 'ok')
        };
        const statusCell = statusMap[statusKey] || pill('Pendente');

        // há arquivo?
        const hasFile =
          !!(p.docs_file_path && p.docs_file_bucket) ||
          !!p.docs_file_url ||
          !!p.docs_file_path;

        // pode visualizar CS? (regra nova)
        const canViewCs = ['under_review','approved'].includes(statusKey);

        row.innerHTML = `
          <td class="js-open" style="cursor:pointer">
            <div><strong>${p.org_name || '—'}</strong></div>
            <div class="muted">${p.org_trade_name || '—'}</div>
            ${p.docs_reason ? `<div class="muted mini">Motivo: ${p.docs_reason}</div>` : ''}
          </td>
          <td class="js-open" style="cursor:pointer">${p.org_document || '—'}</td>
          <td>${statusCell}</td>
          <td>${date(p.docs_submitted_at)}</td>
          <td>${date(p.docs_reviewed_at)}</td>
          <td>${p.docs_reviewed_by || '—'}</td>
          <td>
            <div class="right">
              <button
                class="btn ghost js-view"
                title="Contrato Social — link assinado (10 min)"
                style="width:42px;border-radius:999px;padding:6px 0"
                ${(!hasFile || !canViewCs) ? 'disabled' : ''}>CS</button>
              <button class="btn ghost js-rej" ${(statusKey==='under_review') ? '' : 'disabled'}>Reprovar</button>
              <button class="btn primary js-ok" ${((statusKey==='under_review') && hasFile) ? '' : 'disabled'}>Aprovar</button>
            </div>
          </td>
        `;

        // abrir painéis (org + histórico)
        row.querySelectorAll('.js-open').forEach(cell => {
          cell.addEventListener('click', () => {
            state.currentUser = { id: p.id, name: p.org_name || '—', document: p.org_document || '—' };
            openNotesPanel();
            openOrgPanel(p.id);

            if (jumpBar) jumpBar.style.display = 'flex';
          });
        });

        // ações
        row.querySelector('.js-ok')?.addEventListener('click', async (ev) => {
          if (ev.currentTarget.disabled) return;
          if (!hasFile) { alert('Não há arquivo anexado para este cadastro.'); return; }
          if (!confirm('Aprovar este documento?')) return;
          await setStatus(p.id, 'approved');
        });

        row.querySelector('.js-rej')?.addEventListener('click', async (ev) => {
          if (ev.currentTarget.disabled) return;
          await setStatus(p.id, 'rejected', null); // reason opcional
        });

        // Ver PDF — link assinado (expira em 10 min)
        row.querySelector('.js-view')?.addEventListener('click', async (ev) => {
          ev.preventDefault();
          if (ev.currentTarget.disabled) return;
          await viewSignedDoc(p, ev.currentTarget);
        });

        elGrid.appendChild(row);
      }
    } catch (e) {
      console.error('[admin] load:', e);
      elGrid.innerHTML = `<tr><td colspan="7" class="muted">Falha ao carregar.</td></tr>`;
    }
  }

  // ---------------- Abrir link assinado do PDF (com fallback seguro) ----------------
  async function viewSignedDoc(rec, btnEl) {
    // BLOQUEIO EXTRA: respeita a regra mesmo que o botão tenha sido clicado via DOM hack
    const statusKey = (rec?.docs_status || 'pending').toLowerCase();
    const allowed = ['under_review', 'approved'].includes(statusKey);
    if (!allowed) {
      alert('Documento indisponível para visualização neste status.');
      return;
    }

    // helper: resolve { bucket, path } a partir dos campos ou URL/Path salvo no app
    const getBucketAndPath = () => {
      if (rec.docs_file_bucket && rec.docs_file_path) {
        return { bucket: String(rec.docs_file_bucket), path: String(rec.docs_file_path).replace(/^\/+/, '') };
      }
      const u = rec.docs_file_url || '';
      // URL pública/assinada do Supabase Storage
      const m = u.match(/\/object\/(?:public|authenticated|signing)\/([^/]+)\/(.+)$/i);
      if (m) return { bucket: m[1], path: m[2] };
      // apenas PATH salvo pelo app (bucket privado padrão)
      if (u && !/^https?:\/\//i.test(u)) {
        return { bucket: 'org-docs', path: String(u).replace(/^\/+/, '') };
      }
      // às vezes o app salvou docs_file_path (sem bucket) — ainda assumir org-docs
      if (rec.docs_file_path && !rec.docs_file_bucket) {
        return { bucket: 'org-docs', path: String(rec.docs_file_path).replace(/^\/+/, '') };
      }
      return null;
    };

    try {
      if (!state.pass)     { alert('Informe a senha.'); return; }
      if (!state.reviewer) { alert('Informe seu nome (auditoria).'); return; }
      if (btnEl) btnEl.disabled = true;

      // 1) tenta RPC oficial (gera URL assinada e audita)
      let gotUrl = null;
      try {
        const tryRpc = (args) => sb.rpc('admin_get_signed_doc_url', args);
        let rpc = await tryRpc({
          p_pass: state.pass,
          p_user_id: rec.id,
          p_reviewer_name: state.reviewer,
          p_expires_sec: 600
        });
        if (rpc.error) {
          // compat com instalação antiga (p_reviewer)
          rpc = await tryRpc({
            p_pass: state.pass,
            p_user_id: rec.id,
            p_reviewer: state.reviewer,
            p_expires_sec: 600
          });
        }
        if (!rpc.error) {
          const d = rpc.data;
          gotUrl = Array.isArray(d)
            ? (d[0]?.url || d[0]?.signedUrl || d[0]?.signed_url)
            : (d?.url || d?.signedUrl || d?.signed_url);
        }
      } catch (_) { /* segue fallback */ }

      if (gotUrl) { openInNewTab(gotUrl); return; }

      // 2) fallback: gerar URL assinada direto pelo Storage
      const bp = getBucketAndPath();
      if (bp) {
        const { data, error } = await sb.storage.from(bp.bucket).createSignedUrl(bp.path, 600);
        if (error) throw error;
        const url = data?.signedUrl || data?.signed_url;
        if (url) { openInNewTab(url); return; }
      }

      alert('Nenhum PDF enviado para este cadastro.');
    } catch (e) {
      console.error('[CS] gerar link:', e);
      alert('Não foi possível gerar o link do PDF agora.');
    } finally {
      if (btnEl) btnEl.disabled = false;
    }
  }

  // ---------------- Atualizar status (otimista + recarrega histórico) ----------------
  async function setStatus(userId, status, reason = null) {
    if (!state.pass)     { alert('Senha ausente.'); return; }
    if (!state.reviewer) { alert('Informe seu nome (auditoria).'); return; }

    const clicked = document.activeElement;
    const row = clicked?.closest('tr');
    const buttons = $$('.btn', elGrid);
    const originalLabel = clicked?.textContent;

    // trava UI
    buttons.forEach(b => b.disabled = true);
    if (clicked) clicked.textContent = 'Salvando…';

    // ---- update visual otimista na linha ----
    try {
      if (row) {
        const pill = (t, cls='') => `<span class="pill ${cls}">${t}</span>`;
        const statusCell     = row.children[2]; // Status
        const reviewedAtCell = row.children[4]; // Review
        const reviewerCell   = row.children[5]; // Revisor

        if (status === 'approved') {
          statusCell.innerHTML = pill('Aprovado', 'ok');
        } else if (status === 'rejected') {
          statusCell.innerHTML = pill('Reprovado', 'danger');
        }

        reviewerCell.textContent   = state.reviewer || '—';
        reviewedAtCell.textContent = new Date().toLocaleString();

        // desabilita ações da linha (fica só leitura)
        row.querySelectorAll('button').forEach(b => b.disabled = true);
      }
    } catch {/* ignore visual */}

    try {
      // commit no banco
      const { error } = await sb.rpc('admin_set_docs_status', {
        p_pass: state.pass,
        p_user_id: userId,
        p_status: status,
        p_reason: reason,
        p_reviewer: state.reviewer
      });
      if (error) throw error;

      // feedback do botão
      if (clicked) clicked.textContent = 'Salvo ✓';

      // atualiza painel de histórico do usuário (se aberto)
      try { await reloadNotes(userId); } catch {}

    } catch (e) {
      alert('Erro: ' + (e?.message || e));
    } finally {
      await new Promise(r => setTimeout(r, 150));
      try { await load(); } catch {}
      buttons.forEach(b => b.disabled = false);
      if (clicked) {
        setTimeout(() => { clicked.textContent = originalLabel || clicked.textContent; }, 800);
      }
    }
  }

  // ---------------- Painel de mensagens / histórico ----------------
  function openNotesPanel() {
    if (!state.currentUser) return;
    elMsgTarget && (elMsgTarget.textContent = `— ${state.currentUser.name} • ${state.currentUser.document}`);
    elMsgPanel  && (elMsgPanel.style.display = 'block');
    elMsgText   && (elMsgText.value = '');
    reloadNotes(state.currentUser.id);
    elMsgPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function reloadNotes(userId) {
    if (!state.pass) return;
    if (elMsgHistory) elMsgHistory.innerHTML = 'Carregando…';

    const { data, error } = await sb.rpc('admin_list_notes', {
      p_pass:   state.pass,
      p_user_id:userId,
      p_limit:  50,
      p_offset: 0
    });

    if (error) {
      elMsgHistory && (elMsgHistory.innerHTML = `<span class="muted">Erro: ${error.message}</span>`);
      return;
    }
    renderNotes(data || []);
  }

  function renderNotes(list) {
    if (!list.length) { elMsgHistory.innerHTML = '—'; return; }
    const html = list.map(n => {
      const when = date(n.created_at);
      const who  = n.reviewer_name ? ` • ${n.reviewer_name}` : '';
      const tag  = n.visibility === 'admin' ? 'Interno' : 'App';
      const head = `[${tag}] ${when}${who}`;
      const code = n.code ? ` — ${n.code}` : '';
      return `
        <div style="padding:8px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin:6px 0">
          <div class="mini muted"><strong>${head}</strong>${code}</div>
          <div>${(n.message || '').replace(/\\n/g,'<br>')}</div>
        </div>
      `;
    }).join('');
    elMsgHistory.innerHTML = html;
  }

  elBtnSend?.addEventListener('click', async () => {
    if (!state.currentUser?.id) { alert('Selecione um registro na lista.'); return; }
    if (!state.pass)            { alert('Informe a senha do admin.'); return; }
    if (!state.reviewer)        { alert('Informe seu nome (auditoria).'); return; }

    const msg = fmt(elMsgText?.value);
    if (!msg) { alert('Escreva a mensagem.'); return; }

    try {
      const { error } = await sb.rpc('admin_add_note', {
        p_pass:          state.pass,
        p_user_id:       state.currentUser.id,
        p_kind:          'request_info',
        p_code:          'OUTROS',
        p_message:       msg,
        p_visibility:    'app',
        p_reviewer_name: state.reviewer
      });
      if (error) throw error;

      // feedback leve no botão (sem popup)
      const original = elBtnSend.textContent;
      elBtnSend.disabled = true;
      elBtnSend.textContent = 'Registrada ✓';

      elMsgText && (elMsgText.value = '');
      await reloadNotes(state.currentUser.id);

      setTimeout(() => {
        elBtnSend.textContent = original;
        elBtnSend.disabled = false;
      }, 1600);
    } catch (e) {
      alert('Erro ao gravar: ' + (e?.message || e));
    }
  });

  // ---------------- Painel “Dados da organização” ----------------
  async function openOrgPanel(userId) {
    try {
      if (!orgPanel || !orgForm) return;
      if (!state.pass) { alert('Informe a senha e recarregue a lista.'); return; }

      // Sempre lê do banco via RPC (contorna RLS)
      const { data, error } = await sb.rpc('admin_get_org_profile', {
        p_pass: state.pass,
        p_user_id: userId
      });
      if (error) throw error;

      const d = (Array.isArray(data) ? data[0] : data) || {};

      // Garante que UF seja <select> antes de preencher
      ensureUfSelect();

      // Preenche o form
      const setVal = (k, v) => {
        const el = orgForm.querySelector(`[name="${k}"]`);
        if (el) el.value = v ?? '';
      };
      ['cnpj','razao_social','nome_fantasia','logradouro','numero','complemento','bairro','cidade','uf','cep']
        .forEach(k => setVal(k, d[k]));

      // snapshot p/ cancelar e diff
      orgOriginal = collectForm(orgForm);

      // limpa a observação de auditoria ao trocar de registro
      if (elAudit) elAudit.value = '';

      state.currentUser = { id: userId, name: d.razao_social || '—', document: d.cnpj || '—' };

      setOrgMode('view');
      orgPanel.style.display = 'block';
      orgPanel.scrollIntoView({ behavior:'smooth', block:'start' });
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar dados da organização');
    }
  }

  // ---------- Atalhos ----------
  btnJumpOrg?.addEventListener('click', () => {
    if (!orgPanel) return;
    orgPanel.scrollIntoView({ behavior:'smooth', block:'start' });
    const first = orgForm?.querySelector('input,select,textarea');
    if (first && !first.disabled) first.focus();
  });
  btnJumpMsg?.addEventListener('click', () => {
    if (!elMsgPanel) return;
    elMsgPanel.scrollIntoView({ behavior:'smooth', block:'start' });
    elMsgText?.focus();
  });

  btnEdit?.addEventListener('click', () => setOrgMode('edit'));

  btnCancel?.addEventListener('click', () => {
    const now = collectForm(orgForm);
    const changed = Object.keys(diff(orgOriginal, now)).length > 0 || !!fmt(elAudit?.value);
    if (changed && !confirm('Descartar alterações não salvas?')) return;

    Object.entries(orgOriginal || {}).forEach(([k, v]) => {
      const el = orgForm.querySelector(`[name="${k}"]`);
      if (el) el.value = v ?? '';
    });
    if (elAudit) elAudit.value = '';
    setOrgMode('view');
  });

  btnSave?.addEventListener('click', async () => {
    const now   = collectForm(orgForm);
    const patch = diff(orgOriginal, now);

    if (!state.currentUser?.id) { alert('Selecione um registro.'); return; }
    if (!state.pass)            { alert('Informe a senha.'); return; }
    if (!state.reviewer)        { alert('Informe seu nome (auditoria).'); return; }

    // validações simples
    if (patch.cnpj) {
      const digits = patch.cnpj.replace(/\D/g,'');
      if (digits.length !== 14) { alert('CNPJ inválido (precisa ter 14 dígitos).'); return; }
      patch.cnpj = digits;
    }
    if (patch.uf) {
      patch.uf = patch.uf.toUpperCase();
      if (!/^[A-Z]{2}$/.test(patch.uf)) { alert('UF inválida.'); return; }
    }
    if (patch.cep) {
      const digits = patch.cep.replace(/\D/g,'');
      if (digits && digits.length !== 8) { alert('CEP inválido.'); return; }
      patch.cep = digits;
    }

    const note = fmt(elAudit?.value);
    if (Object.keys(patch).length === 0 && !note) { setOrgMode('view'); return; }

    try {
      const { error } = await sb.rpc('admin_update_org_profile', {
        p_pass:          state.pass,
        p_user_id:       state.currentUser.id,
        p_patch:         patch,
        p_reviewer_name: state.reviewer,
        p_note:          note || null
      });
      if (error) throw error;

      orgOriginal = collectForm(orgForm);
      if (elAudit) elAudit.value = '';

      setOrgMode('view');
      await reloadNotes(state.currentUser.id);
      await load();

      if (btnSave) {
        const original = btnSave.textContent;
        btnSave.disabled = true;
        btnSave.textContent = 'Salvo ✓';
        setTimeout(() => {
          btnSave.textContent = original;
          btnSave.disabled = false;
        }, 1600);
      }
    } catch (e) {
      alert('Erro ao salvar: ' + (e?.message || e));
    }
  });

  // ---------------- Inicial ----------------
  elPass?.focus();
})();
