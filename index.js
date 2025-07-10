const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MONGODB CONNECTION ---
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db;
async function connectToMongo() {
  if (!db) {
    await client.connect();
    db = client.db('appdb');
  }
  return db;
}

// --- UTILS ---
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

// --- MIDDLEWARE ---
app.use(express.static('public'));
app.use(express.json());

// --- UTENTI ONLINE & VISITE ---
const utentiOnline = new Map();
const visiteDailyCount = new Map();

setInterval(() => {
  const now = Date.now();
  const timeout = 60000;
  for (const [username, timestamp] of utentiOnline.entries()) {
    if (now - timestamp > timeout) {
      utentiOnline.delete(username);
    }
  }
}, 30000);

// --- ROUTES ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// LOGIN API
app.post('/api/login', async (req, res) => {
  console.log('RICHIESTA LOGIN ARRIVATA', req.body);
  try {
    const { role, username, pin } = req.body;
    const db = await connectToMongo();
    const user = await db.collection('users').findOne({ role, username, pin });
    if (user) {
      utentiOnline.set(username, Date.now());
      const today = new Date().toISOString().split('T')[0];
      visiteDailyCount.set(today, (visiteDailyCount.get(today) || 0) + 1);
      res.json({ success: true, role: user.role, username: user.username });
    } else {
      res.json({ success: false, message: 'Credenziali errate' });
    }
  } catch (err) {
    console.error('ERRORE LOGIN:', err);
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Heartbeat API
app.post('/api/heartbeat', (req, res) => {
  try {
    const { username } = req.body;
    if (username) {
      utentiOnline.set(username, Date.now());
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Statistiche operatore
app.get('/api/statistiche-operatore', (req, res) => {
  try {
    const utentiOnlineArray = Array.from(utentiOnline.keys());
    const today = new Date().toISOString().split('T')[0];
    const visiteOggi = visiteDailyCount.get(today) || 0;
    res.json({
      success: true,
      utentiOnline: utentiOnlineArray,
      numeroUtentiOnline: utentiOnlineArray.length,
      visiteOggi: visiteOggi
    });
  } catch (err) {
    console.error('Errore login:', err); 
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// --- MESSAGGISTICA ---

// Invia messaggio diretto all'operatore (Miss)
app.post('/api/invia-messaggio-operatore', async (req, res) => {
  try {
    const { username, messaggio } = req.body;
    if (!messaggio || !messaggio.trim()) {
      return res.json({ success: false, message: 'Messaggio vuoto' });
    }
    const db = await connectToMongo();
    const user = await db.collection('users').findOne({ username, role: 'miss' });
    if (!user) {
      return res.json({ success: false, message: 'Utente non trovato' });
    }
    await db.collection('messaggi').insertOne({
      mittente: username,
      destinatario: 'operatore',
      messaggio: messaggio.trim(),
      data: new Date().toISOString(),
      letto: false
    });
    res.json({ success: true, message: 'Messaggio inviato!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Risponde a messaggio utente (Operatore)
app.post('/api/risposta-messaggio-utente', async (req, res) => {
  try {
    const { username, messaggio } = req.body;
    if (!messaggio || !messaggio.trim()) {
      return res.json({ success: false, message: 'Messaggio vuoto' });
    }
    const db = await connectToMongo();
    const user = await db.collection('users').findOne({ username, role: 'miss' });
    if (!user) {
      return res.json({ success: false, message: 'Utente non trovato' });
    }
    await db.collection('messaggi').insertOne({
      mittente: 'operatore',
      destinatario: username,
      messaggio: messaggio.trim(),
      data: new Date().toISOString(),
      letto: false
    });
    res.json({ success: true, message: 'Risposta inviata!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Elimina messaggio (operatore o utente)
app.post('/api/elimina-messaggio', async (req, res) => {
  try {
    const { id } = req.body;
    const db = await connectToMongo();
    const result = await db.collection('messaggi').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: 'Messaggio non trovato.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Modifica messaggio (operatore o utente)
app.post('/api/modifica-messaggio', async (req, res) => {
  try {
    const { id, nuovoTesto } = req.body;
    const db = await connectToMongo();
    const result = await db.collection('messaggi').updateOne(
      { _id: new ObjectId(id) },
      { $set: { messaggio: nuovoTesto } }
    );
    if (result.modifiedCount === 1) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: 'Messaggio non trovato.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Visualizza conversazione con operatore (Miss)
app.get('/api/conversazione-operatore/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const db = await connectToMongo();
    const conversazione = await db.collection('messaggi').find({
      $or: [
        { mittente: username, destinatario: 'operatore' },
        { mittente: 'operatore', destinatario: username }
      ]
    }).sort({ data: 1 }).toArray();
    // Segna come letti i messaggi dell'operatore per questo utente
    await db.collection('messaggi').updateMany(
      { mittente: 'operatore', destinatario: username, letto: false },
      { $set: { letto: true } }
    );
    res.json({ success: true, conversazione });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Visualizza conversazione con utente specifico (Operatore)
app.get('/api/conversazione-utente/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const db = await connectToMongo();
    const conversazione = await db.collection('messaggi').find({
      $or: [
        { mittente: username, destinatario: 'operatore' },
        { mittente: 'operatore', destinatario: username }
      ]
    }).sort({ data: 1 }).toArray();
    // Segna come letti i messaggi dell'utente
    await db.collection('messaggi').updateMany(
      { mittente: username, destinatario: 'operatore', letto: false },
      { $set: { letto: true } }
    );
    res.json({ success: true, conversazione });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Lista conversazioni per operatore
app.get('/api/lista-conversazioni', async (req, res) => {
  try {
    const db = await connectToMongo();
    const messaggi = await db.collection('messaggi').find().toArray();
    const utentiConMessaggi = {};
    messaggi.forEach(m => {
      if (m.mittente !== 'operatore') {
        if (!utentiConMessaggi[m.mittente]) {
          utentiConMessaggi[m.mittente] = {
            username: m.mittente,
            ultimoMessaggio: m.data,
            messaggiNonLetti: 0
          };
        }
        utentiConMessaggi[m.mittente].ultimoMessaggio = m.data;
        if (!m.letto) {
          utentiConMessaggi[m.mittente].messaggiNonLetti++;
        }
      }
    });
    const conversazioni = Object.values(utentiConMessaggi).sort((a, b) =>
      new Date(b.ultimoMessaggio) - new Date(a.ultimoMessaggio)
    );
    res.json({ success: true, conversazioni });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// --- MISS SECTION ---

// Importi disponibili per prelievi
app.get('/api/importi-disponibili', async (req, res) => {
  const db = await connectToMongo();
  const op = await db.collection('users').findOne({ role: 'operatore' });
  res.json(op ? op.importiDisponibili : [10,20,50,100]);
});
// Ottieni importi disponibili per un utente Miss specifico
app.get('/api/importi-disponibili/:username', async (req, res) => {
  const db = await connectToMongo();
  const user = await db.collection('users').findOne({ username: req.params.username, role: 'miss' });
  res.json(user && user.importiDisponibili ? user.importiDisponibili : [10, 20, 50, 100]);
});
// Richiesta prelievo (Miss)
app.post('/api/richiesta-prelievo', async (req, res) => {
  try {
    const { username, importo } = req.body;
    const importoNum = parseFloat(importo); // uso un nome diverso!
    if (isNaN(importoNum) || importoNum <= 0) {
      return res.json({ success: false, message: 'Importo non valido' });
    }
    const db = await connectToMongo();
    const user = await db.collection('users').findOne({ username, role: 'miss' });
    if (!user) {
      return res.json({ success: false, message: 'Utente non trovato' });
    }
    if (user.saldo < importoNum) {
      return res.json({ success: false, message: 'Saldo insufficiente' });
    }
    await db.collection('richieste').insertOne({
      username,
      importo: importoNum,
      stato: 'in attesa',
      data: new Date().toISOString(),
      tipo: 'prelievo'
    });
    await db.collection('users').updateOne({ username, role: 'miss' }, {
      $push: {
        storico: {
          tipo: 'richiesta-prelievo',
          importo: importoNum,
          data: new Date().toISOString(),
          note: 'Richiesta inviata'
        }
      }
    });
    res.json({ success: true, message: 'Richiesta inviata! Attendi risposta dall\'operatore.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Richiesta cambio username/PIN (Miss)
app.post('/api/richiesta-cambio-profilo', async (req, res) => {
  try {
    const { username, nuovoUsername, nuovoPin } = req.body;
    if (!nuovoUsername && !nuovoPin) {
      return res.json({ success: false, message: 'Serve almeno un nuovo valore' });
    }
    const db = await connectToMongo();
    await db.collection('richieste').insertOne({
      username,
      nuovoUsername,
      nuovoPin,
      stato: 'in attesa',
      data: new Date().toISOString(),
      tipo: 'cambio-profilo'
    });
    res.json({ success: true, message: 'Richiesta di cambio inviata!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Stato richieste per Miss
app.get('/api/stato-richieste/:username', async (req, res) => {
  const db = await connectToMongo();
  const richieste = await db.collection('richieste').find({ username: req.params.username }).toArray();
  res.json(richieste);
});

// Visualizza saldo + totale prelevato + account PayPal
app.get('/api/saldo/:username', async (req, res) => {
  const db = await connectToMongo();
  const user = await db.collection('users').findOne({ username: req.params.username, role: 'miss' });
  if (!user) return res.json({ success: false, message: 'Utente non trovato' });
  const totale = await db.collection('richieste').aggregate([
    { $match: { username: user.username, tipo: 'prelievo', stato: 'approvata' } },
    { $group: { _id: null, totale: { $sum: "$importo" } } }
  ]).toArray();
  res.json({
    success: true,
    saldo: user.saldo,
    totalePrelevato: totale[0]?.totale || 0,
    accountPaypal: user.accountPaypal || ''
  });
});

// Modifica account PayPal (Miss)
app.post('/api/modifica-paypal', async (req, res) => {
  try {
    const { username, accountPaypal } = req.body;
    if (accountPaypal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(accountPaypal)) {
      return res.json({ success: false, message: 'Email PayPal non valida.' });
    }
    const db = await connectToMongo();
    const user = await db.collection('users').findOne({ username, role: 'miss' });
    if (!user) {
      return res.json({ success: false, message: 'Utente non trovato' });
    }
    await db.collection('users').updateOne({ username, role: 'miss' }, {
      $set: { accountPaypal: accountPaypal || '' },
      $push: {
        storico: {
          tipo: 'modifica-paypal',
          data: new Date().toISOString(),
          note: `Account PayPal ${accountPaypal ? 'aggiornato' : 'rimosso'}`
        }
      }
    });
    res.json({ success: true, message: 'Account PayPal aggiornato!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Visualizza storico (Miss) + totale prelevato
app.get('/api/storico/:username', async (req, res) => {
  const db = await connectToMongo();
  const user = await db.collection('users').findOne({ username: req.params.username, role: 'miss' });
  if (!user) return res.json({ success: false, message: 'Utente non trovato' });
  const totale = await db.collection('richieste').aggregate([
    { $match: { username: user.username, tipo: 'prelievo', stato: 'approvata' } },
    { $group: { _id: null, totale: { $sum: "$importo" } } }
  ]).toArray();
  res.json({ success: true, storico: user.storico || [], totalePrelevato: totale[0]?.totale || 0 });
});

// --- OPERATOR SECTION ---

// Elenco utenti (solo miss)
app.get('/api/utenti', async (req, res) => {
  const db = await connectToMongo();
  const utenti = await db.collection('users').find({ role: "miss" }).toArray();
  res.json(utenti.map(u => ({
    username: u.username,
    saldo: u.saldo,
    accountPaypal: u.accountPaypal || ''
  })));
});

// Crea o modifica utente (operatore)
app.post('/api/crea-o-modifica-utente', async (req, res) => {
  try {
    const { vecchioUsername, username, pin, saldo, accountPaypal } = req.body;
    const db = await connectToMongo();
    if (vecchioUsername) {
      const user = await db.collection('users').findOne({ username: vecchioUsername, role: 'miss' });
      if (!user) return res.json({ success: false, message: 'Utente non trovato' });
      if (username !== vecchioUsername && await db.collection('users').findOne({ username })) {
        return res.json({ success: false, message: 'Username già esistente' });
      }
      await db.collection('users').updateOne({ username: vecchioUsername, role: 'miss' }, {
        $set: {
          username,
          ...(pin ? { pin } : {}),
          ...(typeof saldo === "number" ? { saldo } : {}),
          ...(accountPaypal !== undefined ? { accountPaypal } : {})
        },
        $push: {
          storico: {
            tipo: 'modifica-profilo-operatore',
            data: new Date().toISOString(),
            note: 'Profilo modificato dall\'operatore'
          }
        }
      });
      return res.json({ success: true, message: 'Utente modificato!' });
    }
    if (!username || !pin) {
      return res.json({ success: false, message: 'Username e PIN obbligatori' });
    }
    if (await db.collection('users').findOne({ username })) {
      return res.json({ success: false, message: 'Username già esistente' });
    }
    await db.collection('users').insertOne({
      role: "miss",
      username,
      pin,
      saldo: saldo !== undefined ? saldo : 10000,
      accountPaypal: accountPaypal || '',
      storico: []
    });
    res.json({ success: true, message: 'Utente creato!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Modifica saldo conto (Operatore)
app.post('/api/modifica-saldo', async (req, res) => {
  try {
    const { username, nuovoSaldo } = req.body;
    const db = await connectToMongo();
    const user = await db.collection('users').findOne({ username, role: 'miss' });
    if (!user) {
      return res.json({ success: false, message: 'Utente non trovato' });
    }
    await db.collection('users').updateOne({ username, role: 'miss' }, {
      $set: { saldo: nuovoSaldo },
      $push: {
        storico: {
          tipo: 'modifica-saldo',
          saldo: nuovoSaldo,
          data: new Date().toISOString(),
          note: 'Saldo modificato dall\'operatore'
        }
      }
    });
    res.json({ success: true, message: 'Saldo modificato correttamente.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Imposta importi disponibili (Operatore)
app.post('/api/imposta-importi', async (req, res) => {
  try {
    const { importiDisponibili } = req.body;
    const db = await connectToMongo();
    await db.collection('users').updateOne({ role: 'operatore' }, { $set: { importiDisponibili } });
    res.json({ success: true, message: 'Importi aggiornati!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});
// Imposta importi disponibili per un utente specifico (Miss)
app.post('/api/imposta-importi-utente', async (req, res) => {
  try {
    const { username, importiDisponibili } = req.body;
    const db = await connectToMongo();
    await db.collection('users').updateOne(
      { username, role: 'miss' },
      { $set: { importiDisponibili } }
    );
    res.json({ success: true, message: 'Importi aggiornati!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// --- RICHIESTE GESTIONE ---

// Elenca richieste (tutte, per vista operatore)
app.get('/api/richieste', async (req, res) => {
  const db = await connectToMongo();
  const richieste = await db.collection('richieste').find().toArray();
  res.json(richieste);
});

// Gestisci richiesta (operatore)
app.post('/api/gestisci-richiesta', async (req, res) => {
  try {
    const { id, approva } = req.body;
    const db = await connectToMongo();
    const richiesta = await db.collection('richieste').findOne({ _id: new ObjectId(id) });
    if (!richiesta || richiesta.stato !== 'in attesa') {
      return res.json({ success: false, message: 'Richiesta non trovata o già gestita.' });
    }
    await db.collection('richieste').updateOne({ _id: new ObjectId(id) }, {
      $set: { stato: approva ? 'approvata' : 'rifiutata', dataGestione: new Date().toISOString() }
    });

    if (richiesta.tipo === 'prelievo' && approva) {
      const user = await db.collection('users').findOne({ username: richiesta.username, role: 'miss' });
      if (user) {
        await db.collection('users').updateOne({ username: richiesta.username, role: 'miss' }, {
          $inc: { saldo: -richiesta.importo },
          $push: {
            storico: {
              tipo: 'prelievo-approvato',
              importo: richiesta.importo,
              data: new Date().toISOString(),
              note: 'Prelievo approvato dall\'operatore'
            }
          }
        });
      }
      await db.collection('users').updateOne({ role: 'operatore' }, {
        $push: {
          storico: {
            tipo: 'prelievo-erogato',
            username: richiesta.username,
            importo: richiesta.importo,
            data: new Date().toISOString(),
            note: 'Prelievo consegnato'
          }
        }
      });
    }

    if (richiesta.tipo === 'creazione-nuovo-utente' && approva) {
      if (await db.collection('users').findOne({ username: richiesta.usernameRichiesto })) {
        await db.collection('richieste').updateOne({ _id: new ObjectId(id) }, { $set: { stato: 'rifiutata' } });
        return res.json({ success: false, message: 'Username già esistente. Richiesta rifiutata.' });
      }
      await db.collection('users').insertOne({
        role: "miss",
        username: richiesta.usernameRichiesto,
        pin: richiesta.pinRichiesto,
        saldo: 10000,
        accountPaypal: '',
        storico: [{
          tipo: 'account-creato',
          data: new Date().toISOString(),
          note: 'Account creato dall\'operatore'
        }]
      });
    }

    if (richiesta.tipo === 'cambio-profilo' && approva) {
      const user = await db.collection('users').findOne({ username: richiesta.username, role: 'miss' });
      if (user) {
        if (richiesta.nuovoUsername && richiesta.nuovoUsername !== user.username) {
          if (await db.collection('users').findOne({ username: richiesta.nuovoUsername })) {
            await db.collection('richieste').updateOne({ _id: new ObjectId(id) }, { $set: { stato: 'rifiutata' } });
            return res.json({ success: false, message: 'Nuovo username già esistente. Modifica rifiutata.' });
          }
          await db.collection('users').updateOne({ username: richiesta.username, role: 'miss' }, { $set: { username: richiesta.nuovoUsername } });
        }
        if (richiesta.nuovoPin) {
          await db.collection('users').updateOne({ username: richiesta.nuovoUsername || richiesta.username, role: 'miss' }, { $set: { pin: richiesta.nuovoPin } });
        }
        await db.collection('users').updateOne({ username: richiesta.nuovoUsername || richiesta.username, role: 'miss' }, {
          $push: {
            storico: {
              tipo: 'cambio-profilo-approvato',
              data: new Date().toISOString(),
              note: 'Cambio username/PIN approvato dall\'operatore'
            }
          }
        });
      }
    }
    if (richiesta.tipo === 'cambio-profilo' && !approva) {
      const user = await db.collection('users').findOne({ username: richiesta.username, role: 'miss' });
      if (user) {
        await db.collection('users').updateOne({ username: richiesta.username, role: 'miss' }, {
          $push: {
            storico: {
              tipo: 'cambio-profilo-rifiutato',
              data: new Date().toISOString(),
              note: 'Cambio username/PIN rifiutato'
            }
          }
        });
      }
    }
    res.json({ success: true, message: approva ? 'Richiesta approvata!' : 'Richiesta rifiutata.' });
  } catch (err) {
  console.error('ERRORE LOGIN:', err); // così vedi l’errore vero nei log
  res.status(500).json({ success: false, message: 'Errore server' });
}
});

// Elimina richiesta (operatore o utente)
app.post('/api/elimina-richiesta', async (req, res) => {
  try {
    const { id } = req.body;
    const db = await connectToMongo();
    const result = await db.collection('richieste').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: 'Richiesta non trovata.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Modifica richiesta (operatore o utente)
app.post('/api/modifica-richiesta', async (req, res) => {
  try {
    const { id, nuoviCampi } = req.body;
    const db = await connectToMongo();
    const result = await db.collection('richieste').updateOne(
      { _id: new ObjectId(id) },
      { $set: nuoviCampi }
    );
    if (result.modifiedCount === 1) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: 'Richiesta non trovata.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Richiesta nuovo utente
app.post('/api/richiesta-nuovo-utente', async (req, res) => {
  try {
    const { username, pin, nome } = req.body;
    if (!username || !pin || !nome) {
      return res.json({ success: false, message: "Compila tutti i campi!" });
    }
    const db = await connectToMongo();
    if (await db.collection('users').findOne({ username })) {
      return res.json({ success: false, message: "Username già esistente!" });
    }
    await db.collection('richieste').insertOne({
      tipo: 'creazione-nuovo-utente',
      usernameRichiesto: username,
      pinRichiesto: pin,
      nomeCompleto: nome,
      stato: 'in attesa',
      data: new Date().toISOString()
    });
    res.json({ success: true, message: "Richiesta inviata all'operatore!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Errore server" });
  }
});

// --- STORICI ---

// Visualizza storico (operator): tutto di tutti, nomi colorati + somma
app.get('/api/storico-operatore', async (req, res) => {
  const db = await connectToMongo();
  const utenti = await db.collection('users').find({ role: "miss" }).toArray();
  let storico = [];
  utenti.forEach(u => {
    (u.storico || []).forEach(s => {
      storico.push({ ...s, username: u.username });
    });
  });
  const totale = await db.collection('richieste').aggregate([
    { $match: { tipo: 'prelievo', stato: 'approvata' } },
    { $group: { _id: null, totale: { $sum: "$importo" } } }
  ]).toArray();
  res.json({ success: true, storico, totalePrelevato: totale[0]?.totale || 0 });
});

// Operatore: modifica il proprio username e/o pin
app.post('/api/cambia-profilo-operatore', async (req, res) => {
  try {
    const { oldUsername, newUsername, newPin } = req.body;
    const db = await connectToMongo();
    const op = await db.collection('users').findOne({ role: 'operatore', username: oldUsername });
    if (!op) {
      return res.json({ success: false, message: 'Operatore non trovato' });
    }
    if (newUsername) {
      if (await db.collection('users').findOne({ username: newUsername }))
        return res.json({ success: false, message: 'Username già esistente!' });
      await db.collection('users').updateOne({ role: 'operatore', username: oldUsername }, { $set: { username: newUsername } });
    }
    if (newPin) {
      await db.collection('users').updateOne({ role: 'operatore', username: newUsername || oldUsername }, { $set: { pin: newPin } });
    }
    await db.collection('users').updateOne({ role: 'operatore', username: newUsername || oldUsername }, {
      $push: {
        storico: {
          tipo: 'modifica-profilo',
          data: new Date().toISOString(),
          note: 'Profilo operatore modificato'
        }
      }
    });
    res.json({ success: true, message: 'Profilo operatore modificato!' });
  } catch (err) {
  console.error('ERRORE LOGIN:', err); 
  res.status(500).json({ success: false, message: 'Errore server' });
}
});

// --- STARTUP ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server in ascolto su http://0.0.0.0:${PORT}`);
});
