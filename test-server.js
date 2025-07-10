const express = require('express');
const path = require('path');

// Simple test server without MongoDB for UI demonstration
const app = express();
const PORT = 3001;

app.use(express.static('public'));
app.use(express.json());

// Mock data for testing
const mockData = {
  users: [
    { 
      username: 'testuser1', 
      role: 'miss', 
      saldo: 1000, 
      withdrawalOptions: [0.02, 0.50, 1.00, 5.00, 10.00] 
    },
    { 
      username: 'testuser2', 
      role: 'miss', 
      saldo: 500, 
      withdrawalOptions: [0.01, 0.25, 2.50, 25.00] 
    },
    { 
      username: 'operator1', 
      role: 'operatore', 
      importiDisponibili: [10, 20, 50, 100] 
    }
  ]
};

// Mock login endpoint
app.post('/api/login', (req, res) => {
  const { role, username, pin } = req.body;
  console.log('Login attempt:', { role, username });
  
  // Simple test login - accept any credentials for demo
  if (role && username) {
    res.json({ success: true, role, username });
  } else {
    res.json({ success: false, message: 'Credenziali errate' });
  }
});

// Mock withdrawal options endpoint
app.get('/api/importi-disponibili', (req, res) => {
  const { username } = req.query;
  console.log('Getting withdrawal options for:', username);
  
  if (username) {
    const user = mockData.users.find(u => u.username === username && u.role === 'miss');
    if (user && user.withdrawalOptions) {
      console.log('Returning user-specific options:', user.withdrawalOptions);
      return res.json(user.withdrawalOptions);
    }
  }
  
  // Fallback to global options
  const operator = mockData.users.find(u => u.role === 'operatore');
  const globalOptions = operator ? operator.importiDisponibili : [10, 20, 50, 100];
  console.log('Returning global options:', globalOptions);
  res.json(globalOptions);
});

// Mock users list endpoint
app.get('/api/utenti', (req, res) => {
  const users = mockData.users.filter(u => u.role === 'miss').map(u => ({
    username: u.username,
    saldo: u.saldo,
    accountPaypal: u.accountPaypal || ''
  }));
  res.json(users);
});

// Mock set user withdrawal options endpoint
app.post('/api/imposta-importi-utente', (req, res) => {
  const { username, withdrawalOptions } = req.body;
  console.log('Setting withdrawal options for user:', username, withdrawalOptions);
  
  try {
    const validOptions = withdrawalOptions.map(opt => {
      const num = parseFloat(opt);
      if (isNaN(num) || num <= 0) {
        throw new Error(`Valore non valido: ${opt}`);
      }
      return Math.round(num * 100) / 100;
    });
    
    const userIndex = mockData.users.findIndex(u => u.username === username && u.role === 'miss');
    if (userIndex >= 0) {
      mockData.users[userIndex].withdrawalOptions = validOptions;
      console.log('Updated user options:', mockData.users[userIndex]);
      res.json({ success: true, message: 'Opzioni di prelievo utente aggiornate!' });
    } else {
      res.json({ success: false, message: 'Utente non trovato' });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Mock withdrawal request endpoint
app.post('/api/richiesta-prelievo', (req, res) => {
  const { username, importo } = req.body;
  console.log('Withdrawal request:', { username, importo });
  
  const parsedImporto = parseFloat(importo);
  if (!parsedImporto || parsedImporto <= 0) {
    return res.json({ success: false, message: 'Importo non valido' });
  }
  
  const roundedImporto = Math.round(parsedImporto * 100) / 100;
  console.log('Processed withdrawal amount:', roundedImporto);
  
  res.json({ success: true, message: `Richiesta di prelievo di ${roundedImporto}€ inviata!` });
});

// Other mock endpoints
app.post('/api/heartbeat', (req, res) => res.json({ success: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on http://0.0.0.0:${PORT}`);
  console.log('Mock data loaded with test users and decimal withdrawal options');
});