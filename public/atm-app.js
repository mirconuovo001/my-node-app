document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const appDiv = document.getElementById('app');
  let session = {};

  function usernameToColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = ((hash>>24)&0xFF).toString(16).padStart(2,'0') +
                  ((hash>>16)&0xFF).toString(16).padStart(2,'0') +
                  ((hash>>8)&0xFF).toString(16).padStart(2,'0');
    return `#${color.slice(0,6)}`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const role = document.getElementById('role').value;
    const username = document.getElementById('username').value.trim();
    const pin = document.getElementById('pin').value.trim();

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, username, pin })
    });
    const data = await res.json();

    if (data.success) {
      form.style.display = 'none';
      session = { role: data.role, username: data.username };
      renderDashboard();
    } else {
      alert(data.message || "Accesso negato");
    }
  });

  // Heartbeat automatico ogni 30 secondi
  setInterval(async () => {
    if (session.username) {
      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: session.username })
        });
      } catch (err) {
        console.log('Heartbeat failed:', err);
      }
    }
  }, 30000);

  function renderDashboard() {
    // Nascondi sempre il pulsante "Richiedi nuovo utente" nelle dashboard personali
    const nuovoUtenteBtn = document.getElementById('richiedi-nuovo-utente');
    if (nuovoUtenteBtn) nuovoUtenteBtn.style.display = 'none';

    if (session.role === "miss") {
      appDiv.innerHTML = `
        <h2>Area Cliente (Miss)</h2>
        <ul>
          <li><button id="richiedi-prelievo">Richiedi prelievo</button></li>
          <li><button id="stato-richieste">Vedi stato richieste</button></li>
          <li><button id="vedi-saldo">Visualizza saldo</button></li>
          <li><button id="vedi-storico">Visualizza storico</button></li>
          <li><button id="richiedi-cambio-profilo">Richiedi cambio username/PIN</button></li>
          <li><button id="gestisci-paypal">Gestisci account PayPal</button></li>
          <li><button id="chat-operatore">💬 Chat con Bancomat</button></li>
        </ul>
        <div id="miss-area"></div>
      `;

      document.getElementById('richiedi-prelievo').onclick = async () => {
        const area = document.getElementById('miss-area');
        area.innerHTML = "<h3>Richiedi prelievo</h3><p>Caricamento importi disponibili...</p>";
        const res = await fetch('/api/importi-disponibili/' + encodeURIComponent(session.username));
        const importi = await res.json();
        area.innerHTML = `
          <h3>Richiedi prelievo</h3>
          <div style="background: #e8f4fd; border: 1px solid #2a5298; border-radius: 8px; padding: 1em; margin-bottom: 1em;">
            <p><strong>💡 Informazione importante:</strong></p>
            <p>Accumula quanti prelievi vuoi, quando il Bancomat sarà online pagherà il saldo. Se sei online quando è online anche il Bancomat, i tuoi prelievi possono incrementare fino a 10 volte al giorno.</p>
            <p><strong>💳 Account PayPal:</strong> Inserisci nella sezione "Gestisci account PayPal" il tuo account per poter ricevere i prelievi.</p>
          </div>
          <form id="prelievo-form">
            <label for="importo">Scegli importo:</label>
            <select id="importo" required>
              ${importi.map(i=>`<option value="${i}">${i} &euro;</option>`).join('')}
            </select>
            <button type="submit">Invia richiesta</button>
          </form>
          <div id="prelievo-msg"></div>
        `;
        document.getElementById('prelievo-form').onsubmit = async (e) => {
          e.preventDefault();
          const importo = parseFloat(document.getElementById('importo').value);
          const res = await fetch('/api/richiesta-prelievo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: session.username, importo })
          });
          const risposta = await res.json();
          document.getElementById('prelievo-msg').innerText = risposta.message;
        };
      };

      document.getElementById('stato-richieste').onclick = async () => {
        const area = document.getElementById('miss-area');
        area.innerHTML = "<h3>Stato richieste</h3><p>Caricamento...</p>";
        const res = await fetch('/api/stato-richieste/' + encodeURIComponent(session.username));
        const richieste = await res.json();
        if (!richieste.length) {
          area.innerHTML = "<p>Nessuna richiesta trovata.</p>";
          return;
        }
        area.innerHTML = richieste.reverse().map(r =>
          `<div style="border:1px solid #6ef5c5; margin:8px; padding:8px;">
            <b>${r.tipo === 'prelievo' ? 'Prelievo' : 'Cambio username/PIN'}</b>
            ${r.tipo === 'prelievo' && r.importo ? `di <b>${r.importo}€</b>` : ""}
            <br>Stato: <b>${r.stato}</b><br>
            <i>Data richiesta: ${new Date(r.data).toLocaleString()}</i>
            ${r.dataGestione ? `<br><i>Gestita il: ${new Date(r.dataGestione).toLocaleString()}</i>` : ""}
          </div>`
        ).join("");
      };

      document.getElementById('vedi-saldo').onclick = async () => {
        const res = await fetch('/api/saldo/' + encodeURIComponent(session.username));
        const data = await res.json();
        if (data.success)
          document.getElementById('miss-area').innerHTML = `
            <p>Saldo attuale: <b>${data.saldo} €</b></p>
            <p>Totale prelevato fino ad ora: <b>${data.totalePrelevato} €</b></p>
            <p>Account PayPal: <b>${data.accountPaypal || 'Non impostato'}</b></p>`;
        else
          document.getElementById('miss-area').innerHTML = `<p>${data.message}</p>`;
      };

      document.getElementById('vedi-storico').onclick = async () => {
        const area = document.getElementById('miss-area');
        area.innerHTML = "<h3>Storico operazioni</h3><p>Caricamento...</p>";
        const res = await fetch('/api/storico/' + encodeURIComponent(session.username));
        const data = await res.json();
        if (!data.success) {
          area.innerHTML = `<p>${data.message}</p>`;
          return;
        }
        area.innerHTML = `<h4>Totale prelevato: <b>${data.totalePrelevato} €</b></h4>` + 
          data.storico.reverse().map(op =>
            `<div style="border:1px solid #6ef5c5; margin:8px; padding:8px;">
              <b>${op.tipo.replace(/-/g, ' ')}</b> ${op.importo ? op.importo + '€' : ''} 
              <br><i>${new Date(op.data).toLocaleString()}</i> <br>
              ${op.note ? `<span>${op.note}</span>` : ""}
            </div>`
          ).join("");
      };

      document.getElementById('richiedi-cambio-profilo').onclick = () => {
        document.getElementById('miss-area').innerHTML = `
          <h3>Richiedi cambio username e/o PIN</h3>
          <form id="cambia-profilo-form">
            <label for="nuovoUsername">Nuovo username (facoltativo):</label>
            <input type="text" id="nuovoUsername" />
            <label for="nuovoPin">Nuovo PIN (facoltativo):</label>
            <input type="password" id="nuovoPin" maxlength="6" />
            <button type="submit">Invia richiesta</button>
          </form>
          <div id="cambia-profilo-msg"></div>
        `;
        document.getElementById('cambia-profilo-form').onsubmit = async (e) => {
          e.preventDefault();
          const nuovoUsername = document.getElementById('nuovoUsername').value.trim();
          const nuovoPin = document.getElementById('nuovoPin').value.trim();
          const res = await fetch('/api/richiesta-cambio-profilo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: session.username, nuovoUsername, nuovoPin })
          });
          const risposta = await res.json();
          document.getElementById('cambia-profilo-msg').innerText = risposta.message;
        };
      };

      document.getElementById('gestisci-paypal').onclick = async () => {
        const res = await fetch('/api/saldo/' + encodeURIComponent(session.username));
        const data = await res.json();
        const currentPaypal = data.success ? data.accountPaypal || '' : '';

        document.getElementById('miss-area').innerHTML = `
          <h3>Gestisci account PayPal</h3>
          <p>Account PayPal attuale: <b>${currentPaypal || 'Non impostato'}</b></p>
          <form id="paypal-form">
            <label for="accountPaypal">Nuovo account PayPal:</label>
            <input type="email" id="accountPaypal" value="${currentPaypal}" placeholder="esempio@email.com" />
            <button type="submit">Aggiorna</button>
          </form>
          <div id="paypal-msg"></div>
        `;

        document.getElementById('paypal-form').onsubmit = async (e) => {
          e.preventDefault();
          const accountPaypal = document.getElementById('accountPaypal').value.trim();
          const res = await fetch('/api/modifica-paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: session.username, accountPaypal })
          });
          const risposta = await res.json();
          document.getElementById('paypal-msg').innerText = risposta.message;
        };
      };

      document.getElementById('chat-operatore').onclick = async () => {
        const area = document.getElementById('miss-area');
        area.innerHTML = "<h3>💬 Chat con Bancomat</h3><p>Caricamento conversazione...</p>";

        const res = await fetch('/api/conversazione-operatore/' + encodeURIComponent(session.username));
        const data = await res.json();

        if (!data.success) {
          area.innerHTML = `<p>${data.message}</p>`;
          return;
        }

        const conversazioneHtml = data.conversazione.map(msg => {
          const isMio = msg.mittente === session.username;
          const stile = isMio ? 
            'background: #e3f2fd; border-left: 4px solid #2196f3; text-align: right;' : 
            'background: #f3e5f5; border-left: 4px solid #9c27b0; text-align: left;';
          return `
            <div style="${stile} padding: 8px; margin: 8px 0; border-radius: 8px;">
              <div style="font-weight: bold; color: ${isMio ? '#2196f3' : '#9c27b0'};">
                ${isMio ? 'Tu' : 'Bancomat'}
              </div>
              <div style="margin: 4px 0;">${msg.messaggio}</div>
              <div style="font-size: 0.8em; color: #666;">
                ${new Date(msg.data).toLocaleString()}
              </div>
            </div>
          `;
        }).join('');

        area.innerHTML = `
          <h3>💬 Chat con Bancomat</h3>
          <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin: 10px 0; background: #fafafa;">
            ${conversazioneHtml || '<p style="text-align: center; color: #666;">Nessun messaggio ancora</p>'}
          </div>
          <form id="chat-form">
            <label for="nuovo-messaggio">Scrivi un messaggio:</label>
            <textarea id="nuovo-messaggio" rows="3" placeholder="Scrivi qui il tuo messaggio..." required></textarea>
            <button type="submit">Invia messaggio</button>
          </form>
          <div id="chat-msg"></div>
          <button onclick="document.getElementById('chat-operatore').click()" style="margin-top: 10px;">🔄 Aggiorna chat</button>
        `;

        document.getElementById('chat-form').onsubmit = async (e) => {
          e.preventDefault();
          const messaggio = document.getElementById('nuovo-messaggio').value.trim();
          const res = await fetch('/api/invia-messaggio-operatore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: session.username, messaggio })
          });
          const risposta = await res.json();
          document.getElementById('chat-msg').innerText = risposta.message;
          if (risposta.success) {
            document.getElementById('nuovo-messaggio').value = '';
            setTimeout(() => document.getElementById('chat-operatore').click(), 1000);
          }
        };
      };

    } else if (session.role === "operatore") {
      appDiv.innerHTML = `
        <h2>Area Operatore (Bancomat Umano)</h2>
        <ul>
          <li><button id="gestisci-utenti">Crea/Modifica utente</button></li>
          <li><button id="gestisci-prelievi">Imposta importi disponibili</button></li>
          <li><button id="vedi-richieste">Gestisci richieste utenti</button></li>
          <li><button id="modifica-saldo">Modifica saldo utente</button></li>
          <li><button id="vedi-storico-op">Storico globale</button></li>
          <li><button id="vedi-statistiche">Statistiche e utenti online</button></li>
          <li><button id="gestisci-messaggi">💬 Gestisci messaggi utenti</button></li>
          <li><button id="modifica-profilo-operatore">Cambia il tuo username/PIN</button></li>
        </ul>
        <div id="operatore-area"></div>
      `;

      document.getElementById('modifica-profilo-operatore').onclick = () => {
        document.getElementById('operatore-area').innerHTML = `
          <h3>Modifica il tuo username e/o PIN</h3>
          <form id="modifica-operatore-form">
            <label for="nuovoOpUsername">Nuovo username (lascia vuoto per non cambiare):</label>
            <input type="text" id="nuovoOpUsername" />
            <label for="nuovoOpPin">Nuovo PIN (lascia vuoto per non cambiare):</label>
            <input type="password" id="nuovoOpPin" maxlength="6" />
            <button type="submit">Salva</button>
          </form>
          <div id="modifica-operatore-msg"></div>
        `;
        document.getElementById('modifica-operatore-form').onsubmit = async (e) => {
          e.preventDefault();
          const newUsername = document.getElementById('nuovoOpUsername').value.trim();
          const newPin = document.getElementById('nuovoOpPin').value.trim();
          const res = await fetch('/api/cambia-profilo-operatore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldUsername: session.username, newUsername, newPin })
          });
          const data = await res.json();
          document.getElementById('modifica-operatore-msg').innerText = data.message;
          if (data.success && newUsername) session.username = newUsername;
        };
      };

      document.getElementById('gestisci-utenti').onclick = async () => {
        const area = document.getElementById('operatore-area');
        const utentiRes = await fetch('/api/utenti');
        const utenti = await utentiRes.json();
        area.innerHTML = `
          <h3>Crea o modifica utente</h3>
          <form id="utenti-form">
            <label for="selezionaUtente">Seleziona utente per modifica (lascia vuoto per nuovo):</label>
            <select id="selezionaUtente">
              <option value="">Nuovo utente</option>
              ${utenti.map(u => `<option value="${u.username}">${u.username} (PayPal: ${u.accountPaypal || 'Non impostato'})</option>`).join('')}
            </select>
            <label for="newUsername">Username:</label>
            <input type="text" id="newUsername" required />
            <label for="newPin">PIN:</label>
            <input type="password" id="newPin" maxlength="6" required />
            <label for="newSaldo">Saldo:</label>
            <input type="number" id="newSaldo" value="0" required />
            <label for="newAccountPaypal">Account PayPal:</label>
            <input type="email" id="newAccountPaypal" placeholder="esempio@email.com" />
            <button type="submit">Salva</button>
          </form>
          <div id="utenti-msg"></div>
        `;
        document.getElementById('selezionaUtente').onchange = function() {
          const sel = this.value;
          if (!sel) {
            document.getElementById('newUsername').value = "";
            document.getElementById('newPin').value = "";
            document.getElementById('newSaldo').value = 0;
            document.getElementById('newAccountPaypal').value = "";
          } else {
            const user = utenti.find(u => u.username === sel);
            document.getElementById('newUsername').value = user.username;
            document.getElementById('newSaldo').value = user.saldo;
            document.getElementById('newAccountPaypal').value = user.accountPaypal || "";
            document.getElementById('newPin').value = "";
          }
        };
        document.getElementById('utenti-form').onsubmit = async (e) => {
          e.preventDefault();
          const vecchioUsername = document.getElementById('selezionaUtente').value || undefined;
          const username = document.getElementById('newUsername').value.trim();
          const pin = document.getElementById('newPin').value.trim();
          const saldo = parseFloat(document.getElementById('newSaldo').value);
          const accountPaypal = document.getElementById('newAccountPaypal').value.trim();
          const res = await fetch('/api/crea-o-modifica-utente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vecchioUsername, username, pin, saldo, accountPaypal })
          });
          const data = await res.json();
          document.getElementById('utenti-msg').innerText = data.message;
        };
      };

      document.getElementById('gestisci-prelievi').onclick = async () => {
  const area = document.getElementById('operatore-area');
  const utentiRes = await fetch('/api/utenti');
  const utenti = await utentiRes.json();
  area.innerHTML = `
    <h3>Imposta importi disponibili per utente</h3>
    <form id="importi-utente-form">
      <label for="utenteImporti">Utente:</label>
      <select id="utenteImporti" required>
        ${utenti.map(u => `<option value="${u.username}">${u.username}</option>`).join('')}
      </select>
      <label for="importi">Importi separati da virgola (es: 10,20,0.01,100):</label>
      <input type="text" id="importi" required />
      <button type="submit">Aggiorna</button>
    </form>
    <div id="importi-msg"></div>
  `;

  // Funzione per caricare gli importi della Miss selezionata
  async function caricaImportiMiss(username) {
    const res = await fetch('/api/importi-disponibili/' + encodeURIComponent(username));
    const importi = await res.json();
    document.getElementById('importi').value = importi.join(',');
  }

  // Quando cambio il nome utente, aggiorna gli importi mostrati
  document.getElementById('utenteImporti').onchange = (e) => {
    caricaImportiMiss(e.target.value);
  };

  // Carica importi del primo utente selezionato all'apertura
  caricaImportiMiss(document.getElementById('utenteImporti').value);

  document.getElementById('importi-utente-form').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('utenteImporti').value;
    const importi = document.getElementById('importi').value.split(',').map(x => parseFloat(x.trim())).filter(x => x > 0);
    const res = await fetch('/api/imposta-importi-utente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, importiDisponibili: importi })
    });
    const data = await res.json();
    document.getElementById('importi-msg').innerText = data.message;
  };
};

      document.getElementById('vedi-richieste').onclick = async () => {
  const area = document.getElementById('operatore-area');
  area.innerHTML = "<h3>Gestione richieste utenti</h3><p>Caricamento...</p>";
  try {
    const res = await fetch('/api/richieste');
    if (!res.ok) {
      area.innerHTML = "<p>Errore nel caricamento delle richieste (codice " + res.status + ").</p>";
      return;
    }
    const richieste = await res.json();
    // Log per debug
    console.log('Risposta richieste:', richieste);

    if (!Array.isArray(richieste) || richieste.length === 0) {
      area.innerHTML = "<p>Nessuna richiesta trovata.</p>";
      return;
    }
    area.innerHTML = "<h4>Richieste di tutti gli utenti</h4>" +
      richieste.reverse().map(r => {
        const color = usernameToColor(r.username || "");
        let label = '';
        if (r.tipo === 'prelievo') {
          label = `Prelievo di <b>${r.importo}€</b>`;
        } else if (r.tipo === 'cambio-profilo') {
          let campi = [];
          if (r.nuovoUsername) campi.push(`Nuovo username: <b>${r.nuovoUsername}</b>`);
          if (r.nuovoPin) campi.push(`Nuovo PIN: <b>${r.nuovoPin}</b>`);
          label = `Cambio username/PIN<br>${campi.join('<br>')}`;
        } else if (r.tipo === 'creazione-nuovo-utente') {
          label = `Richiesta nuovo utente<br>
                   Username: <b>${r.usernameRichiesto}</b><br>
                   PIN: <b>${r.pinRichiesto}</b><br>
                   Nome: <b>${r.nomeCompleto}</b>`;
        }
        return `<div style="border:1px solid #6ef5c5; margin:8px; padding:8px;">
          <span class="user-color" style="background:${color}">${r.username || ''}</span> 
          - ${label} 
          <br>Stato: <b>${r.stato}</b> 
          <br><i>Data richiesta: ${r.data ? new Date(r.data).toLocaleString() : ''}</i>
          ${r.dataGestione ? `<br><i>Gestita il: ${new Date(r.dataGestione).toLocaleString()}</i>` : ""}
          ${r.stato === 'in attesa' ? `
            <button onclick="gestisciRichiesta('${r._id}', true)">Approva</button>
            <button onclick="gestisciRichiesta('${r._id}', false)">Rifiuta</button>
          ` : ""}
        </div>`;
      }).join("");
  } catch (error) {
    area.innerHTML = `<p>Errore JS: ${error.message}</p>`;
    console.error(error);
  }
};

      window.gestisciRichiesta = async (id, approva) => {
        const area = document.getElementById('operatore-area');
        const res = await fetch('/api/gestisci-richiesta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, approva })
        });
        const data = await res.json();
        alert(data.message);
        document.getElementById('vedi-richieste').click();
      };

      document.getElementById('modifica-saldo').onclick = async () => {
        const area = document.getElementById('operatore-area');
        const utentiRes = await fetch('/api/utenti');
        const utenti = await utentiRes.json();
        area.innerHTML = `
          <h3>Modifica saldo utente</h3>
          <form id="saldo-form">
            <label for="userMod">Utente:</label>
            <select id="userMod" required>
              ${utenti.map(u => `<option value="${u.username}">${u.username} (saldo: ${u.saldo}€, PayPal: ${u.accountPaypal || 'Non impostato'})</option>`).join('')}
            </select>
            <label for="nuovoSaldo">Nuovo saldo:</label>
            <input type="number" id="nuovoSaldo" required />
            <button type="submit">Aggiorna saldo</button>
          </form>
          <div id="saldo-msg"></div>
        `;
        document.getElementById('saldo-form').onsubmit = async (e) => {
          e.preventDefault();
          const username = document.getElementById('userMod').value;
          const nuovoSaldo = parseFloat(document.getElementById('nuovoSaldo').value);
          const res = await fetch('/api/modifica-saldo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, nuovoSaldo })
          });
          const data = await res.json();
          document.getElementById('saldo-msg').innerText = data.message;
        };
      };

      document.getElementById('vedi-storico-op').onclick = async () => {
        const area = document.getElementById('operatore-area');
        area.innerHTML = "<h3>Storico operazioni (tutti gli utenti)</h3><p>Caricamento...</p>";
        const res = await fetch('/api/storico-operatore');
        const data = await res.json();
        if (!data.success) {
          area.innerHTML = `<p>${data.message}</p>`;
          return;
        }
        area.innerHTML = `<h4>Totale prelevato da tutti: <b>${data.totalePrelevato} €</b></h4>` +
          data.storico.reverse().map(op => {
            const color = usernameToColor(op.username||'');
            return `<div style="border:1px solid #6ef5c5; margin:8px; padding:8px;">
              <span class="user-color" style="background:${color}">${op.username||''}</span>
              <b>${op.tipo.replace(/-/g, ' ')}</b> 
              ${op.importo ? op.importo + '€' : ''} 
              <br><i>${new Date(op.data).toLocaleString()}</i> 
              ${op.note ? `<br><span>${op.note}</span>` : ""}
            </div>`;
          }).join("");
      };

      document.getElementById('vedi-statistiche').onclick = async () => {
        const area = document.getElementById('operatore-area');
        area.innerHTML = "<h3>Statistiche e utenti online</h3><p>Caricamento...</p>";
        const res = await fetch('/api/statistiche-operatore');
        const data = await res.json();
        if (!data.success) {
          area.innerHTML = `<p>${data.message}</p>`;
          return;
        }

        const utentiOnlineHtml = data.utentiOnline.length > 0 ? 
          data.utentiOnline.map(username => {
            const color = usernameToColor(username);
            return `<span class="user-color" style="background:${color}; margin: 2px;">${username}</span>`;
          }).join(' ') : 
          '<span style="color: #666;">Nessun utente online</span>';

        area.innerHTML = `
          <div style="background: #e8f4fd; border: 1px solid #2a5298; border-radius: 8px; padding: 1em; margin-bottom: 1em;">
            <h4>📊 Statistiche in tempo reale</h4>
            <p><strong>Utenti online ora:</strong> ${data.numeroUtentiOnline}</p>
            <p><strong>Visite di oggi:</strong> ${data.visiteOggi}</p>
          </div>
          <div style="background: #f0f8ff; border: 1px solid #2a5298; border-radius: 8px; padding: 1em;">
            <h4>👥 Utenti attualmente online:</h4>
            <p>${utentiOnlineHtml}</p>
          </div>
          <button onclick="document.getElementById('vedi-statistiche').click()" style="margin-top: 1em;">🔄 Aggiorna</button>
        `;
      };

      document.getElementById('gestisci-messaggi').onclick = async () => {
        const area = document.getElementById('operatore-area');
        area.innerHTML = "<h3>💬 Gestisci messaggi utenti</h3><p>Caricamento conversazioni...</p>";

        const res = await fetch('/api/lista-conversazioni');
        const data = await res.json();

        if (!data.success) {
          area.innerHTML = `<p>${data.message}</p>`;
          return;
        }

        if (data.conversazioni.length === 0) {
          area.innerHTML = '<h3>💬 Gestisci messaggi utenti</h3><p>Nessuna conversazione trovata.</p>';
          return;
        }

        const conversazioniHtml = data.conversazioni.map(conv => {
          const color = usernameToColor(conv.username);
          const badge = conv.messaggiNonLetti > 0 ? 
            `<span style="background: #f44336; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.8em;">${conv.messaggiNonLetti}</span>` : '';
          return `
            <div style="border: 1px solid #ddd; padding: 10px; margin: 8px 0; border-radius: 8px; cursor: pointer; background: #f9f9f9;" onclick="apriConversazione('${conv.username}')">
              <span class="user-color" style="background:${color}; margin-right: 8px;">${conv.username}</span>
              ${badge}
              <div style="font-size: 0.9em; color: #666; margin-top: 4px;">
                Ultimo messaggio: ${new Date(conv.ultimoMessaggio).toLocaleString()}
              </div>
            </div>
          `;
        }).join('');

        area.innerHTML = `
          <h3>💬 Gestisci messaggi utenti</h3>
          <div style="margin-bottom: 1em;">
            <h4>Conversazioni attive:</h4>
            ${conversazioniHtml}
          </div>
          <button onclick="document.getElementById('gestisci-messaggi').click()" style="margin-top: 10px;">🔄 Aggiorna lista</button>
        `;
      };

      window.apriConversazione = async (username) => {
        const area = document.getElementById('operatore-area');
        area.innerHTML = `<h3>💬 Chat con ${username}</h3><p>Caricamento conversazione...</p>`;

        const res = await fetch('/api/conversazione-utente/' + encodeURIComponent(username));
        const data = await res.json();

        if (!data.success) {
          area.innerHTML = `<p>${data.message}</p>`;
          return;
        }

        const conversazioneHtml = data.conversazione.map(msg => {
          const isOperatore = msg.mittente === 'operatore';
          const stile = isOperatore ? 
            'background: #e8f5e8; border-left: 4px solid #4caf50; text-align: right;' : 
            'background: #fff3e0; border-left: 4px solid #ff9800; text-align: left;';
          return `
            <div style="${stile} padding: 8px; margin: 8px 0; border-radius: 8px;">
              <div style="font-weight: bold; color: ${isOperatore ? '#4caf50' : '#ff9800'};">
                ${isOperatore ? 'Tu (Bancomat)' : username}
              </div>
              <div style="margin: 4px 0;">${msg.messaggio}</div>
              <div style="font-size: 0.8em; color: #666;">
                ${new Date(msg.data).toLocaleString()}
              </div>
            </div>
          `;
        }).join('');

        area.innerHTML = `
          <h3>💬 Chat con ${username}</h3>
          <button onclick="document.getElementById('gestisci-messaggi').click()" style="margin-bottom: 10px;">← Torna alle conversazioni</button>
          <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin: 10px 0; background: #fafafa;">
            ${conversazioneHtml || '<p style="text-align: center; color: #666;">Nessun messaggio ancora</p>'}
          </div>
          <form id="risposta-form">
            <label for="risposta-messaggio">Rispondi a ${username}:</label>
            <textarea id="risposta-messaggio" rows="3" placeholder="Scrivi qui la tua risposta..." required></textarea>
            <button type="submit">Invia risposta</button>
          </form>
          <div id="risposta-msg"></div>
          <button onclick="apriConversazione('${username}')" style="margin-top: 10px;">🔄 Aggiorna chat</button>
        `;

        document.getElementById('risposta-form').onsubmit = async (e) => {
          e.preventDefault();
          const messaggio = document.getElementById('risposta-messaggio').value.trim();
          const res = await fetch('/api/risposta-messaggio-utente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, messaggio })
          });
          const risposta = await res.json();
          document.getElementById('risposta-msg').innerText = risposta.message;
          if (risposta.success) {
            document.getElementById('risposta-messaggio').value = '';
            setTimeout(() => apriConversazione(username), 1000);
          }
        };
      };
    }
  }

  // Gestione richiesta nuovo utente - spostata fuori dal dashboard operatore
  document.getElementById('richiedi-nuovo-utente').onclick = () => {
    const loginForm = document.getElementById('login-form');
    const richiediBtn = document.getElementById('richiedi-nuovo-utente');

    loginForm.style.display = 'none';
    richiediBtn.style.display = 'none';

    appDiv.innerHTML = `
      <h3>Richiesta creazione nuovo utente</h3>
      <form id="form-nuovo-utente">
        <label for="nuovo-username">Username desiderato:</label>
        <input type="text" id="nuovo-username" required>
        <label for="nuovo-pin">PIN desiderato:</label>
        <input type="password" id="nuovo-pin" maxlength="6" required>
        <label for="nuovo-nome">Nome completo:</label>
        <input type="text" id="nuovo-nome" required>
        <button type="submit">Invia richiesta</button>
        <button type="button" id="annulla-nuovo-utente">Annulla</button>
      </form>
      <div id="msg-nuovo-utente"></div>
    `;

    document.getElementById('form-nuovo-utente').onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('nuovo-username').value.trim();
      const pin = document.getElementById('nuovo-pin').value.trim();
      const nome = document.getElementById('nuovo-nome').value.trim();

      try {
        const res = await fetch('/api/richiesta-nuovo-utente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, pin, nome })
        });
        const data = await res.json();
        document.getElementById('msg-nuovo-utente').innerText = data.message;

        if (data.success) {
          setTimeout(() => {
            location.reload();
          }, 2000);
        }
      } catch (error) {
        document.getElementById('msg-nuovo-utente').innerText = 'Errore di connessione';
      }
    };

    document.getElementById('annulla-nuovo-utente').onclick = () => {
      location.reload();
    };
  };
});
